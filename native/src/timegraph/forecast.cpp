#include "timegraph/forecast.hpp"

#include "timegraph/anchor.hpp"

#include <algorithm>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <mutex>
#include <thread>

namespace waffle::timegraph {
namespace {

constexpr Second stride = sim::replay_anchor_stride;
constexpr Second maxSecond = (Second{1} << 53) - 1;

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
    // Each cell indexes an exact region record in this page. The storage cap
    // bounds the total number of records well below the 32-bit index limit.
    static_assert(forecastStorageCap / sizeof(SiteSummary) < UINT32_MAX);
    static std::size_t initialBytes(std::size_t rows, std::size_t regions)
    {
        return sizeof(Page) + rows * (sizeof(SummaryHeader) + regions * sizeof(std::uint32_t)) +
            regions * sizeof(SiteSummary);
    }

    Page(std::size_t rows, std::size_t regions) : headers(rows), indices(rows * regions)
    {
        records.reserve(regions);
    }

    std::size_t bytes() const
    {
        return sizeof(Page) + headers.capacity() * sizeof(SummaryHeader) +
            indices.capacity() * sizeof(std::uint32_t) + records.capacity() * sizeof(SiteSummary);
    }

    // Stage indices in the unpublished row so admission knows exactly how
    // much capacity to reserve. Published rows and records are immutable.
    std::size_t stage(std::size_t slot, std::span<const SiteSummary> row)
    {
        auto next = records.size();
        auto* dest = indices.data() + slot * row.size();
        for (std::size_t i = 0; i < row.size(); ++i) {
            if (slot) {
                const auto prior = indices[(slot - 1) * row.size() + i];
                // SiteSummary contains exactly 16 doubles and no padding.
                if (std::memcmp(&records[prior], &row[i], sizeof(SiteSummary)) == 0) {
                    dest[i] = prior;
                    continue;
                }
            }
            dest[i] = static_cast<std::uint32_t>(next++);
        }
        if (next <= records.capacity()) return 0;
        return std::min(indices.size(), std::max(next, records.capacity() * 2)) - records.capacity();
    }

    void append(std::size_t slot, std::span<const SiteSummary> row, std::size_t growth)
    {
        if (growth) records.reserve(records.capacity() + growth);
        for (std::size_t i = 0; i < row.size(); ++i)
            if (indices[slot * row.size() + i] == records.size()) records.push_back(row[i]);
    }

    std::vector<SummaryHeader> headers;
    std::vector<std::uint32_t> indices;
    std::vector<SiteSummary> records;
};

struct Generation {
    Coverage info;
    sim::ActionJournal actions;
    std::size_t actionBytes{};
    std::size_t summaryBytes{};
    std::vector<std::unique_ptr<Page>> pages;
    std::vector<std::shared_ptr<const detail::Anchor>> anchors;
    std::vector<std::shared_ptr<sim::runtime::HistoryArena>> arenas;
    std::size_t runtimeBytes{}, rowBytes{};

    void measure(const sim::RuntimeState& state)
    {
        const auto add = [&](const auto& arena) {
            if (arena && std::ranges::find(arenas, arena) == arenas.end()) arenas.push_back(arena);
        };
        add(state.practiceRecipeStorage.historyArena);
        state.histories.for_each_table([&](const auto& rows) {
            for (const auto& row : rows) add(row.arena());
        });
        runtimeBytes = std::max(runtimeBytes, detail::runtime_bytes(state));
    }

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
            summaryBytes -= pages.back()->bytes();
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
    std::optional<std::size_t> historyHeadroom;
    GenerationId previousId{};
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
        : limit(limit), worker([this] { run(); }) {}

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

    Storage storage(bool historyBreakdown = false) const
    {
        Storage result;
        result.anchors = anchorBytes.load(std::memory_order_relaxed);
        if (current) result.forecastWorking = current->runtimeBytes + current->rowBytes;
        for (const auto* entry : {current.get(), previous.get()}) {
            if (!entry) continue;
            result.summaries += entry->summaryBytes + entry->pages.capacity() * sizeof(entry->pages.front());
            result.anchors += entry->anchors.capacity() * sizeof(entry->anchors.front());
            result.journals += sizeof(Generation) + entry->actionBytes;
            result.journals += entry->arenas.capacity() * sizeof(entry->arenas.front());
            result.restoreWorking = std::max(result.restoreWorking, entry->runtimeBytes);
            for (const auto& arena : entry->arenas) {
                if (entry == previous.get() && current &&
                    std::ranges::find(current->arenas, arena) != current->arenas.end()) continue;
                if (historyBreakdown) {
                    const auto bytes = arena->storage();
                    result.historyRetained += bytes.retained;
                    result.historyLive += bytes.live;
                    result.historyRecycled += bytes.recycled;
                } else {
                    result.historyRetained += arena->retained_bytes();
                }
            }
        }
        return result;
    }

    void finishAtLimit(Generation& generation)
    {
        if (!generation.info.publishedThrough) {
            generation.actions = {};
            generation.actionBytes = 0;
            generation.arenas = {};
            generation.runtimeBytes = generation.rowBytes = 0;
        }
        generation.info.completion = Completion::storageLimit;
        progress.notify_all();
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
                if (job) job->historyHeadroom.reset();
                restore(std::move(next), std::move(lock));
                continue;
            }
            if (pending) job = std::move(pending);
            if (job) {
                const auto previousId = previous ? previous->info.generation : 0;
                if (!job->historyHeadroom || job->previousId != previousId) {
                    const auto used = storage().chargedBytes();
                    if (used > limit) {
                        finishAtLimit(*job->generation);
                        continue;
                    }
                    job->historyHeadroom = limit - used;
                    job->previousId = previousId;
                }
                lock.unlock();
                step(*job, *job->historyHeadroom);
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

    void step(Job& job, std::size_t historyGrowth)
    {
        try {
            const sim::runtime::HistoryArena::GrowthLimit growth(historyGrowth);
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
        } catch (const sim::runtime::HistoryArena::GrowthLimitReached&) {
            const std::lock_guard lock(mutex);
            if (!stopping && current == job.generation) finishAtLimit(*job.generation);
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
        const auto previousRuntimeBytes = generation.runtimeBytes;
        if (slot == 0 || end) generation.measure(job.state);
        const auto newPage = slot == 0 ? Page::initialBytes(rows, info.regions) : 0;
        const auto indexGrowth = [](const auto& index, bool append) {
            return append && index.size() == index.capacity() ? std::max<std::size_t>(1, index.size()) : 0;
        };
        const auto pageIndexGrowth = indexGrowth(generation.pages, slot == 0);
        const auto anchorIndexGrowth = indexGrowth(generation.anchors, slot == 0 || end);
        const auto recordGrowth = slot ? generation.pages.back()->stage(slot, job.row) : 0;
        const auto pageCharge = recordGrowth * sizeof(SiteSummary) + newPage + pageIndexGrowth * sizeof(generation.pages.front());
        const auto anchorIndexCharge = anchorIndexGrowth * sizeof(generation.anchors.front());

        const auto finishAtLimit = [&] {
            generation.runtimeBytes = previousRuntimeBytes;
            this->finishAtLimit(generation);
        };
        // Carry the new headroom into the next step. A restore or releasing
        // the previous generation invalidates it before that step starts.
        const auto fits = [&](std::size_t used, std::size_t extra) {
            return used <= limit && extra <= limit - used;
        };
        auto used = storage().chargedBytes();
        if (!fits(used, pageCharge)) {
            finishAtLimit();
            return;
        }
        std::shared_ptr<const detail::Anchor> anchor;
        if (slot == 0 || end) {
            const auto* old = generation.anchors.empty() ? nullptr : generation.anchors.back().get();
            anchor = std::make_shared<const detail::Anchor>(anchorBytes, job.state, old);
            const auto withAnchor = storage().chargedBytes();
            if (fits(withAnchor, pageCharge + anchorIndexCharge)) {
                used = withAnchor + anchorIndexCharge;
            } else {
                anchor.reset();
                if (slot == 0) {
                    finishAtLimit();
                    return;
                }
            }
        }
        job.historyHeadroom = limit - used - pageCharge;
        if (slot == 0) {
            if (pageIndexGrowth) generation.pages.reserve(generation.pages.size() + pageIndexGrowth);
            generation.pages.push_back(std::make_unique<Page>(rows, info.regions));
            generation.summaryBytes += newPage;
            generation.pages.back()->stage(0, job.row);
        }
        if (anchor) {
            if (anchorIndexGrowth) generation.anchors.reserve(generation.anchors.size() + anchorIndexGrowth);
            generation.anchors.push_back(std::move(anchor));
        }
        auto& page = *generation.pages.back();
        page.headers[slot] = header;
        page.append(slot, job.row, recordGrowth);
        generation.summaryBytes += recordGrowth * sizeof(SiteSummary);
        info.publishedThrough = second;
        info.anchors = generation.anchors.size();
        if (end) {
            info.completion = header.terminal ? Completion::terminal : Completion::horizon;
        }
        if (slot == 0 || end) progress.notify_all();
    }

    const std::size_t limit;
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
    next->rowBytes = sizeof(Job) - sizeof(sim::RuntimeState) + job->row.capacity() * sizeof(SiteSummary);
    next->measure(job->state);
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
    impl_->pending = std::move(job);
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
    return impl_->storage(true);
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
        const auto* indices = page.indices.data() + slot * regions;
        for (std::size_t j = 0; j < rows * regions; ++j)
            sites[i * regions + j] = page.records[indices[j]];
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
