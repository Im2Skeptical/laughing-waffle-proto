#include "timegraph/forecast.hpp"

#include "timegraph/anchor.hpp"

#include <algorithm>
#include <cmath>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace waffle::timegraph {
namespace {

constexpr Second stride = sim::replay_anchor_stride;
constexpr Second maxSecond = (Second{1} << 53) - 1;
constexpr std::size_t maxWorkingAllowance = 24 * 1024 * 1024;

std::size_t payload_bytes(const core::json::Value& value)
{
    using Kind = core::json::Value::Kind;
    switch (value.kind()) {
    case Kind::string:
        return value.as_string().capacity() + 1;
    case Kind::array: {
        const auto& array = value.as_array();
        auto bytes = array.capacity() * sizeof(array.front());
        for (const auto& entry : array) bytes += payload_bytes(entry);
        return bytes;
    }
    case Kind::object: {
        const auto& object = value.as_object();
        auto bytes = object.capacity() * sizeof(object.front());
        for (const auto& entry : object) bytes += entry.key.capacity() + 1 + payload_bytes(entry.value);
        return bytes;
    }
    default:
        return 0;
    }
}

std::size_t journal_bytes(const sim::ActionJournal& journal)
{
    // ActionJournal's underlying vector grows geometrically on admission.
    auto bytes = 2 * journal.entries().size() * sizeof(sim::Action);
    for (const auto& entry : journal.entries()) bytes += entry.kind.capacity() + 1 + payload_bytes(entry.payload);
    return bytes;
}

std::string replay_error(const sim::ReplayResult& result)
{
    auto error = std::string(result.reason) + " at second " + std::to_string(static_cast<Second>(result.tSec));
    if (result.action) error += ": " + result.action->kind + " / " + std::string(result.actionReason);
    return error;
}

struct Page {
    static std::size_t bytes(std::size_t rows, std::size_t regions)
    {
        return sizeof(Page) + rows * (sizeof(SummaryHeader) + regions * sizeof(SiteSummary));
    }

    Page(std::size_t rows, std::size_t regions) : headers(rows), sites(rows * regions) {}
    std::vector<SummaryHeader> headers;
    std::vector<SiteSummary> sites;
};

struct Generation {
    Coverage info;
    sim::ActionJournal actions;
    std::size_t actionBytes{};
    std::size_t summaryBytes{};
    std::vector<std::unique_ptr<Page>> pages;
    std::vector<std::shared_ptr<const detail::Anchor>> anchors;

    void discard()
    {
        pages.clear();
        anchors.clear();
        summaryBytes = 0;
    }

    void retain(Second through)
    {
        auto& end = *info.publishedThrough;
        if (through >= end && info.completion != Completion::running) return;
        end = std::min(end, through);
        info.completion = Completion::retained;
        const auto kept = (end - info.start) / stride + 1;
        while (pages.size() > kept) {
            summaryBytes -= Page::bytes(pages.back()->headers.size(), info.regions);
            pages.pop_back();
        }
        while (anchors.back()->second() > end) anchors.pop_back();
        info.anchors = anchors.size();
    }
};

struct Job {
    Job(std::shared_ptr<Generation> generation, sim::RuntimeState initial, BoundaryActions boundary)
        : generation(std::move(generation)), state(std::move(initial)),
          replay(this->generation->actions, state.hot.tSec, boundary == BoundaryActions::applied),
          row(this->generation->info.regions) {}

    std::shared_ptr<Generation> generation;
    sim::RuntimeState state;
    sim::ReplayCursor replay;
    std::vector<SiteSummary> row;
    bool first = true;
};

struct Request {
    GenerationId generation;
    Second second;
    GenerationId revision;
    std::promise<Restore> promise;

    void finish(RestoreStatus status, std::optional<sim::RuntimeState> state = {}, std::string error = {})
    {
        promise.set_value({generation, second, status, std::move(state), std::move(error)});
    }
};

}

struct Forecast::Impl {
    explicit Impl(std::size_t limit)
        : limit(limit), allowance(std::min(limit / 8, maxWorkingAllowance)), worker([this] { run(); }) {}

    ~Impl()
    {
        {
            const std::lock_guard lock(mutex);
            stopping = true;
            supersedeRequest();
        }
        progress.notify_all();
        worker.join();
    }

    void supersedeRequest()
    {
        if (request) request->finish(RestoreStatus::superseded);
        request.reset();
    }

    Generation* find(GenerationId generation) const
    {
        for (auto* entry : {current.get(), previous.get()})
            if (entry && entry->info.generation == generation) return entry;
        return nullptr;
    }

    Storage storage() const
    {
        Storage result;
        result.anchors = anchorBytes.load();
        if (current || previous) result.workingAllowance = allowance;
        for (const auto* entry : {current.get(), previous.get()}) {
            if (!entry) continue;
            result.summaries += entry->summaryBytes + entry->pages.capacity() * sizeof(entry->pages.front());
            result.anchors += entry->anchors.capacity() * sizeof(entry->anchors.front());
            result.journals += sizeof(Generation) + entry->actionBytes;
        }
        return result;
    }

    bool hasRoom(std::size_t bytes) const
    {
        const auto used = storage().chargedBytes();
        return used <= limit && bytes <= limit - used;
    }

    void run()
    {
        std::unique_ptr<Job> job;
        while (true) {
            std::unique_lock lock(mutex);
            if (stopping) return;
            if (job && (current != job->generation || current->info.completion != Completion::running)) {
                lock.unlock();
                job.reset();
                continue;
            }
            if (request) {
                auto next = std::move(*request);
                request.reset();
                restore(std::move(next), std::move(lock));
                continue;
            }
            if (pending) job = std::move(pending);
            if (job) {
                lock.unlock();
                step(*job);
                continue;
            }
            progress.wait(lock);
        }
    }

    void restore(Request next, std::unique_lock<std::mutex> lock)
    {
        const auto* generation = find(next.generation);
        if (!generation || !generation->info.publishedThrough || next.second < generation->info.start ||
            next.second > *generation->info.publishedThrough) {
            next.finish(generation ? RestoreStatus::unavailable : RestoreStatus::superseded);
            return;
        }
        auto session = current.get() == generation ? current : previous;
        const auto it = std::ranges::upper_bound(generation->anchors, next.second, {},
            [](const auto& anchor) { return anchor->second(); });
        const auto anchor = *std::prev(it);
        lock.unlock();

        RestoreStatus status = RestoreStatus::ready;
        std::optional<sim::RuntimeState> state;
        std::string error;
        try {
            state.emplace(anchor->copy());
            sim::ReplayCursor replay(session->actions, state->hot.tSec, true);
            if (const auto result = replay.advance_to(*state, static_cast<double>(next.second)); !result) {
                status = RestoreStatus::failed;
                error = replay_error(result);
                state.reset();
            }
        } catch (const std::exception& exception) {
            status = RestoreStatus::failed;
            error = exception.what();
            state.reset();
        }
        lock.lock();
        if (stopping || revision != next.revision || !find(next.generation))
            next.finish(RestoreStatus::superseded);
        else
            next.finish(status, std::move(state), std::move(error));
    }

    void step(Job& job)
    {
        try {
            if (job.first) sim::initialize_replay_clock(job.state);
            const auto replay = job.first ? job.replay.apply_boundary(job.state) : job.replay.advance(job.state);
            job.first = false;
            if (!replay) {
                fail(job, replay_error(replay));
                return;
            }
            const auto header = summarize(job.state, job.row);
            const std::lock_guard lock(mutex);
            if (stopping || current != job.generation) return;
            publish(job, header);
        } catch (const std::exception& error) {
            fail(job, error.what());
        }
    }

    void fail(Job& job, std::string error)
    {
        const std::lock_guard lock(mutex);
        if (stopping || current != job.generation) return;
        current->info.completion = Completion::failed;
        current->info.error = std::move(error);
        progress.notify_all();
    }

    void publish(Job& job, const SummaryHeader& header)
    {
        auto& generation = *job.generation;
        auto& info = generation.info;
        const auto second = static_cast<Second>(header.second);
        const auto offset = second - info.start;
        const auto slot = static_cast<std::size_t>(offset % stride);
        const auto rows = static_cast<std::size_t>(std::min(stride, info.target - second + 1));
        const bool end = header.terminal.has_value() || second == info.target;
        const auto newPage = slot == 0 ? Page::bytes(rows, info.regions) : 0;
        const auto indexGrowth = [](const auto& index, bool append) {
            return append && index.size() == index.capacity() ? std::max<std::size_t>(1, index.size()) : 0;
        };
        const auto pageIndexGrowth = indexGrowth(generation.pages, slot == 0);
        const auto anchorIndexGrowth = indexGrowth(generation.anchors, slot == 0 || end);
        const auto pageCharge = newPage + pageIndexGrowth * sizeof(generation.pages.front());
        const auto anchorIndexCharge = anchorIndexGrowth * sizeof(generation.anchors.front());

        const auto finishAtLimit = [&] {
            info.completion = Completion::storageLimit;
            progress.notify_all();
        };
        if (!hasRoom(pageCharge)) {
            finishAtLimit();
            return;
        }
        std::shared_ptr<const detail::Anchor> anchor;
        if (slot == 0 || end) {
            const auto* old = generation.anchors.empty() ? nullptr : generation.anchors.back().get();
            anchor = std::make_shared<const detail::Anchor>(anchorBytes, job.state, old);
            if (!hasRoom(pageCharge + anchorIndexCharge)) {
                anchor.reset();
                if (slot == 0) {
                    finishAtLimit();
                    return;
                }
            }
        }
        if (slot == 0) {
            if (pageIndexGrowth) generation.pages.reserve(generation.pages.size() + pageIndexGrowth);
            generation.pages.push_back(std::make_unique<Page>(rows, info.regions));
            generation.summaryBytes += newPage;
        }
        if (anchor) {
            if (anchorIndexGrowth) generation.anchors.reserve(generation.anchors.size() + anchorIndexGrowth);
            generation.anchors.push_back(std::move(anchor));
        }
        auto& page = *generation.pages.back();
        page.headers[slot] = header;
        std::ranges::copy(job.row, page.sites.begin() + slot * info.regions);
        info.publishedThrough = second;
        info.anchors = generation.anchors.size();
        if (end) {
            info.completion = header.terminal ? Completion::terminal : Completion::horizon;
        }
        if (slot == 0 || end) progress.notify_all();
    }

    const std::size_t limit, allowance;
    mutable std::mutex mutex;
    mutable std::condition_variable progress;
    std::atomic_size_t anchorBytes{};
    std::shared_ptr<Generation> current, previous;
    std::unique_ptr<Job> pending;
    std::optional<Request> request;
    GenerationId revision{};
    bool stopping{};
    std::thread worker;
};

Forecast::Forecast(std::size_t storageBytes)
{
    if (storageBytes > forecastStorageCap || storageBytes < 4096)
        throw std::invalid_argument("invalid forecast storage limit");
    impl_ = std::make_unique<Impl>(storageBytes);
}

Forecast::~Forecast() = default;

GenerationId Forecast::start(sim::RuntimeState initial, sim::ActionJournal actions, Second target,
                             BoundaryActions boundary, std::optional<Second> retainThrough)
{
    const auto base = initial.hot.tSec;
    if (!(base >= 0 && base <= static_cast<double>(maxSecond)) || std::floor(base) != base ||
        target > maxSecond || target < static_cast<Second>(base))
        throw std::invalid_argument("forecast requires ordered nonnegative whole seconds");
    const auto regions = initial.hot.world.regions.size();
    if (!initial.compiledContent || regions == 0 ||
        regions > impl_->limit / (stride * sizeof(SiteSummary)))
        throw std::invalid_argument("forecast requires an admitted world within the summary budget");

    auto next = std::make_shared<Generation>();
    next->info.start = static_cast<Second>(base);
    next->info.target = target;
    next->info.regions = regions;
    next->actionBytes = journal_bytes(actions);
    next->actions = std::move(actions);
    auto job = std::make_unique<Job>(next, std::move(initial), boundary);
    const std::lock_guard lock(impl_->mutex);
    next->info.generation = ++impl_->revision;
    impl_->supersedeRequest();
    impl_->pending.reset();
    if (impl_->previous) impl_->previous->discard();
    impl_->previous.reset();
    if (retainThrough && impl_->current && impl_->current->info.publishedThrough &&
        *retainThrough >= impl_->current->info.start) {
        impl_->current->retain(*retainThrough);
        impl_->previous = std::move(impl_->current);
    }
    if (impl_->current) impl_->current->discard();
    impl_->current = next;
    if (impl_->hasRoom(0)) {
        impl_->pending = std::move(job);
    } else {
        next->actions = {};
        next->actionBytes = 0;
        next->info.completion = Completion::storageLimit;
    }
    impl_->progress.notify_all();
    return next->info.generation;
}

void Forecast::cancel(GenerationId generation)
{
    const std::lock_guard lock(impl_->mutex);
    if (!impl_->current || impl_->current->info.generation != generation) return;
    ++impl_->revision;
    impl_->supersedeRequest();
    impl_->pending.reset();
    impl_->current->discard();
    impl_->current.reset();
    impl_->progress.notify_all();
}

void Forecast::releasePrevious()
{
    const std::lock_guard lock(impl_->mutex);
    if (impl_->previous && impl_->request && impl_->previous->info.generation == impl_->request->generation)
        impl_->supersedeRequest();
    if (impl_->previous) impl_->previous->discard();
    impl_->previous.reset();
    impl_->progress.notify_all();
}

std::optional<Coverage> Forecast::coverage(GenerationId generation) const
{
    const std::lock_guard lock(impl_->mutex);
    if (const auto* entry = impl_->find(generation)) return entry->info;
    return {};
}

std::optional<Coverage> Forecast::wait(GenerationId generation, std::optional<Second> through) const
{
    std::unique_lock lock(impl_->mutex);
    impl_->progress.wait(lock, [&] {
        const auto* entry = impl_->find(generation);
        return !entry || entry->info.completion != Completion::running ||
            (through && entry->info.publishedThrough && *entry->info.publishedThrough >= *through);
    });
    if (const auto* entry = impl_->find(generation)) return entry->info;
    return {};
}

Storage Forecast::storage() const
{
    const std::lock_guard lock(impl_->mutex);
    return impl_->storage();
}

std::size_t Forecast::readSummaries(GenerationId generation, Second first, std::span<SummaryHeader> headers,
                                    std::span<SiteSummary> sites) const
{
    const std::lock_guard lock(impl_->mutex);
    const auto* entry = impl_->find(generation);
    if (!entry || !entry->info.publishedThrough || first < entry->info.start ||
        first > *entry->info.publishedThrough) return 0;
    const auto regions = entry->info.regions;
    const auto count = std::min<std::size_t>({stride, headers.size(), sites.size() / regions,
                                             *entry->info.publishedThrough - first + 1});
    for (std::size_t i = 0; i < count;) {
        const auto offset = first - entry->info.start + i;
        const auto& page = *entry->pages[offset / stride];
        const auto slot = offset % stride;
        const auto rows = std::min<std::size_t>(count - i, page.headers.size() - slot);
        std::copy_n(page.headers.begin() + slot, rows, headers.begin() + i);
        std::copy_n(page.sites.begin() + slot * regions, rows * regions, sites.begin() + i * regions);
        i += rows;
    }
    return count;
}

std::future<Restore> Forecast::stateAtSecond(GenerationId generation, Second second)
{
    const std::lock_guard lock(impl_->mutex);
    Request next{generation, second, impl_->revision, {}};
    auto future = next.promise.get_future();
    const auto* entry = impl_->find(generation);
    if (!entry || !entry->info.publishedThrough || second < entry->info.start ||
        second > *entry->info.publishedThrough) {
        next.finish(entry ? RestoreStatus::unavailable : RestoreStatus::superseded);
        return future;
    }
    impl_->supersedeRequest();
    impl_->request = std::move(next);
    impl_->progress.notify_all();
    return future;
}

}
