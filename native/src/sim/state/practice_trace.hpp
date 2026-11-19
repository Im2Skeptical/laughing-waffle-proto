#pragma once

// Included by rows.generated.hpp after the trace and its payload are defined.
namespace waffle::sim::runtime {

struct PhaseTrace {
    double tSec;
    double id;
    RegionId region;
    EventKindId kind;
    HistoryTextId phase;
    browser::OptionalNullable<FactionId> controller;

    PracticeEventTrace expand() const
    {
        return {.tSec = tSec, .kind = kind, .regionId = region, .rootId = id, .id = id,
                .phase = phase, .faction = controller, .controller = controller,
                .instanceId = controller.has_key() ? browser::OptionalNullable<InstanceId>{std::nullopt}
                                                   : browser::OptionalNullable<InstanceId>{}};
    }
};

// A chunk has exactly one writer. Published records own disjoint, stable
// storage. Growing a subsequent receipt cannot invalidate an earlier reader.
class PracticeTraceChunk final : public history_detail::Node, private std::pmr::memory_resource {
public:
    struct Rich {
        Rich(std::pmr::memory_resource* resource, Rich* previous)
            : payload(resource), previous(previous) {}
        PracticeEventTrace row;
        HistoryPayload payload;
        Rich* previous;
    };

    explicit PracticeTraceChunk(const std::shared_ptr<HistoryArena>& arena) : Node(arena), upstream_(arena.get()) {}
    ~PracticeTraceChunk()
    {
        while (last_) {
            auto* previous = last_->previous;
            std::destroy_at(last_);
            last_ = previous;
        }
    }

    template<class T>
    T* reserve_row()
    {
        const auto offset = (used_ + alignof(T) - 1) & ~(alignof(T) - 1);
        if (sizeof(T) > storage_.size() - offset) return nullptr;
        used_ = offset + sizeof(T);
        return reinterpret_cast<T*>(storage_.data() + offset);
    }

    template<class Build>
    void build(Rich* slot, Build& fill)
    {
        auto* record = ::new (slot) Rich(this, last_);
        last_ = record;
        if constexpr (std::is_invocable_v<Build&, PracticeEventTrace&, HistoryPayload&>)
            fill(record->row, record->payload);
        else
            record->row = fill(record->payload);
    }

private:
    alignas(std::max_align_t) std::array<std::byte, 3968> storage_;
    std::size_t used_{};
    Rich* last_{};
    HistoryArena* upstream_;

    void* do_allocate(std::size_t bytes, std::size_t alignment) override
    {
        const auto offset = (used_ + alignment - 1) & ~(alignment - 1);
        if (alignment <= alignof(std::max_align_t) && offset <= storage_.size() && bytes <= storage_.size() - offset) {
            used_ = offset + bytes;
            return storage_.data() + offset;
        }
        return upstream_->allocate(bytes, alignment);
    }
    void do_deallocate(void* pointer, std::size_t bytes, std::size_t alignment) override
    {
        const auto address = reinterpret_cast<std::uintptr_t>(pointer);
        if (address - reinterpret_cast<std::uintptr_t>(storage_.data()) >= storage_.size())
            upstream_->deallocate(pointer, bytes, alignment);
    }
    bool do_is_equal(const std::pmr::memory_resource& other) const noexcept override { return this == &other; }
};

struct PracticeTraceRef {
    history_detail::Handle<PracticeTraceChunk> owner;
    const void* record{};
    bool phase{};

    template<class Visit>
    void inspect(Visit& visit) const
    {
        if (phase) {
            static const HistoryPayload empty;
            visit(static_cast<const PhaseTrace*>(record)->expand(), empty);
        } else {
            const auto& rich = *static_cast<const PracticeTraceChunk::Rich*>(record);
            visit(rich.row, rich.payload);
        }
    }
};

struct TraceCursorPayload {
    std::size_t live_bytes() const { return 0; }
};

// A value copy retains only ordered immutable references. Its next write
// opens a fresh chunk. The original writer can finish unused storage in its
// own tail, even while another thread inspects the published prefix.
class PracticeTraceWriter {
    history_detail::Handle<PracticeTraceChunk> owner_;
    PracticeTraceChunk* tail_{};

    template<class T>
    T* reserve(const std::shared_ptr<HistoryArena>& arena)
    {
        if (tail_) {
            if (auto* row = tail_->reserve_row<T>()) return row;
        }
        owner_ = decltype(owner_)::make(arena);
        tail_ = &owner_.write();
        return tail_->reserve_row<T>();
    }

public:
    PracticeTraceWriter() = default;
    PracticeTraceWriter(const PracticeTraceWriter&) {}
    PracticeTraceWriter(PracticeTraceWriter&& other) noexcept
        : owner_(std::move(other.owner_)), tail_(std::exchange(other.tail_, nullptr)) {}
    PracticeTraceWriter& operator=(PracticeTraceWriter other) noexcept
    {
        std::swap(owner_, other.owner_);
        std::swap(tail_, other.tail_);
        return *this;
    }

    template<class Build>
    PracticeTraceRef rich(Build& build, const std::shared_ptr<HistoryArena>& arena)
    {
        auto* slot = reserve<PracticeTraceChunk::Rich>(arena);
        tail_->build(slot, build);
        return {owner_, slot, false};
    }

    PracticeTraceRef phase(PhaseTrace row, const std::shared_ptr<HistoryArena>& arena)
    {
        auto* slot = reserve<PhaseTrace>(arena);
        std::construct_at(slot, row);
        return {owner_, slot, true};
    }
};

template<class Field>
class History<PracticeEventTrace, 100, Field, HistoryPayload> {
    using Cursor = History<PracticeTraceRef, 100, Field, TraceCursorPayload>;
    Cursor cursor_;
    PracticeTraceWriter writer_;
    std::shared_ptr<HistoryArena> arena_;

public:
    using Name = Field;
    std::size_t size() const { return cursor_.size(); }
    void clear() { cursor_.clear(); writer_ = {}; }

    template<class Build>
    static History load(std::size_t count, Build build, const std::shared_ptr<HistoryArena>& arena = {})
    {
        History result;
        if (!count) return result;
        result.arena_ = arena ? arena : std::make_shared<HistoryArena>();
        result.cursor_ = Cursor::load(count, [&](TraceCursorPayload&, std::size_t index) {
            auto fill = [&](HistoryPayload& page) { return build(page, index); };
            return result.writer_.rich(fill, result.arena_);
        }, result.arena_);
        return result;
    }

    template<class Build>
    PracticeTraceRef append(Build build, const std::shared_ptr<HistoryArena>& arena = {})
    {
        if (!arena_) arena_ = arena ? arena : std::make_shared<HistoryArena>();
        auto ref = writer_.rich(build, arena_);
        link(ref, arena_);
        return ref;
    }
    PracticeTraceRef append_phase(PhaseTrace row, const std::shared_ptr<HistoryArena>& arena)
    {
        auto ref = writer_.phase(row, arena);
        link(ref, arena);
        return ref;
    }
    void link(const PracticeTraceRef& ref, const std::shared_ptr<HistoryArena>& arena)
    {
        cursor_.append([&](TraceCursorPayload&) noexcept { return ref; }, arena);
    }
    void push(PracticeEventTrace row) { append([&](HistoryPayload&) { return row; }); }

    template<class Visit>
    void for_each(Visit visit) const
    {
        cursor_.for_each([&](const PracticeTraceRef& ref, const TraceCursorPayload&) { ref.inspect(visit); });
    }

    PracticeEventTrace at(std::size_t index) const
    {
        PracticeEventTrace result;
        auto copy = [&](const PracticeEventTrace& row, const HistoryPayload&) { result = row; };
        cursor_.at(index).inspect(copy);
        return result;
    }

    std::size_t live_bytes() const
    {
        return cursor_.live_bytes();
    }
};

}
