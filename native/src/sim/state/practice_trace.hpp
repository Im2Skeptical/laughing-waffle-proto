#pragma once

#include <cstring>

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

// The field mask records optional key presence. Present values keep their
// object representation, including the distinct null state of OptionalNullable.
// No padding participates in deciding which fields or how many bytes to store.
struct TraceEncoder {
    std::byte* next;
    std::uint64_t present{};

    template<class T>
    void put(const T& value)
    {
        static_assert(std::is_trivially_copyable_v<T>);
        std::memcpy(next, &value, sizeof(T));
        next += sizeof(T);
    }

    template<unsigned I, class T>
    void field(const T& value)
    {
        static_assert(I < 64);
        if constexpr (requires { value.has_value(); }) {
            if (!value) return;
            present |= std::uint64_t{1} << I;
            put(*value);
        } else if constexpr (requires { value.has_key(); }) {
            if (!value.has_key()) return;
            present |= std::uint64_t{1} << I;
            put(value);
        } else {
            put(value);
        }
    }
};

struct TraceDecoder {
    const std::byte* next;
    std::uint64_t present;

    template<class T>
    void get(T& value)
    {
        static_assert(std::is_trivially_copyable_v<T>);
        std::memcpy(&value, next, sizeof(T));
        next += sizeof(T);
    }

    template<unsigned I, class T>
    void field(T& value)
    {
        if constexpr (requires { value.has_value(); }) {
            if (present & (std::uint64_t{1} << I)) get(value.emplace());
        } else if constexpr (requires { value.has_key(); }) {
            if (present & (std::uint64_t{1} << I)) get(value);
        } else {
            get(value);
        }
    }
};

enum class TraceFormat : std::uint8_t { phase, packed, withPayload };

// A chunk has exactly one writer. Published records own disjoint, stable
// storage. Growing a subsequent receipt cannot invalidate an earlier reader.
class PracticeTraceChunk final : public history_detail::Node, private std::pmr::memory_resource {
public:
    struct PayloadNode {
        HistoryPayload payload;
        PayloadNode* previous;
    };
    // Reserve the largest possible record while its builder is active.
    // After packing, the next record starts just past the actual fields.
    struct PackedSpace {
        std::byte bytes[sizeof(std::uint64_t) + sizeof(PracticeEventTrace)];
    };
    struct alignas(PayloadNode) RecordSpace {
        std::byte bytes[sizeof(PayloadNode) + sizeof(std::uint64_t) + sizeof(PracticeEventTrace)];
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
        if (offset > payloadBegin_ || sizeof(T) > payloadBegin_ - offset) return nullptr;
        used_ = offset + sizeof(T);
        return reinterpret_cast<T*>(storage_.data() + offset);
    }

    template<class Build>
    TraceFormat build(RecordSpace* slot, Build& fill)
    {
        auto* start = reinterpret_cast<std::byte*>(slot);
        HistoryPayload payload(this);
        PracticeEventTrace row;
        if constexpr (std::is_invocable_v<Build&, PracticeEventTrace&, HistoryPayload&>)
            fill(row, payload);
        else
            row = fill(payload);

        auto format = TraceFormat::packed;
        if (payload.live_bytes()) {
            static_assert(std::is_nothrow_move_constructible_v<HistoryPayload>);
            last_ = ::new (start) PayloadNode{std::move(payload), last_};
            start += sizeof(PayloadNode);
            format = TraceFormat::withPayload;
        }
        pack(start, row);
        return format;
    }

    void pack(std::byte* start, const PracticeEventTrace& row)
    {
        TraceEncoder encoder{start + sizeof(std::uint64_t)};
        visit_trace_fields(row, encoder);
        std::memcpy(start, &encoder.present, sizeof(encoder.present));
        used_ = static_cast<std::size_t>(encoder.next - storage_.data());
    }

private:
    alignas(std::max_align_t) std::array<std::byte, 3968> storage_;
    std::size_t used_{};
    std::size_t payloadBegin_{storage_.size()};
    PayloadNode* last_{};
    HistoryArena* upstream_;

    // Records grow from the front, variable payload from the back. A builder
    // can allocate payload before the size of its packed record is known.
    void* do_allocate(std::size_t bytes, std::size_t alignment) override
    {
        if (alignment <= alignof(std::max_align_t) && bytes <= payloadBegin_) {
            const auto begin = (payloadBegin_ - bytes) & ~(alignment - 1);
            if (begin >= used_) {
                payloadBegin_ = begin;
                return storage_.data() + begin;
            }
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
    TraceFormat format{};

    template<class Visit>
    void inspect(Visit& visit) const
    {
        static const HistoryPayload empty;
        if (format == TraceFormat::phase) {
            visit(static_cast<const PhaseTrace*>(record)->expand(), empty);
            return;
        }
        auto* bytes = static_cast<const std::byte*>(record);
        const auto* payload = &empty;
        if (format == TraceFormat::withPayload) {
            payload = &static_cast<const PracticeTraceChunk::PayloadNode*>(record)->payload;
            bytes += sizeof(PracticeTraceChunk::PayloadNode);
        }
        TraceDecoder decoder{bytes + sizeof(std::uint64_t), 0};
        std::memcpy(&decoder.present, bytes, sizeof(decoder.present));
        PracticeEventTrace row;
        visit_trace_fields(row, decoder);
        visit(row, *payload);
    }
};

struct TraceCursorPayload {
    // Pages retain even their evicted prefix until the entire page is dropped.
    // The first row of a run owns the chunk for subsequent rows on that page.
    const PracticeTraceChunk* lastChunk{};

    PracticeTraceRef retain(const PracticeTraceRef& ref) noexcept
    {
        if (lastChunk == ref.owner.operator->()) return {{}, ref.record, ref.format};
        lastChunk = ref.owner.operator->();
        return ref;
    }

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
        auto* slot = reserve<PracticeTraceChunk::RecordSpace>(arena);
        return {owner_, slot, tail_->build(slot, build)};
    }

    PracticeTraceRef packed(const PracticeEventTrace& row, const std::shared_ptr<HistoryArena>& arena)
    {
        auto* slot = reserve<PracticeTraceChunk::PackedSpace>(arena);
        tail_->pack(slot->bytes, row);
        return {owner_, slot, TraceFormat::packed};
    }

    PracticeTraceRef phase(PhaseTrace row, const std::shared_ptr<HistoryArena>& arena)
    {
        auto* slot = reserve<PhaseTrace>(arena);
        std::construct_at(slot, row);
        return {owner_, slot, TraceFormat::phase};
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
    std::shared_ptr<HistoryArena> arena() const { return cursor_.arena(); }
    void clear() { cursor_.clear(); writer_ = {}; }

    template<class Build>
    static History load(std::size_t count, Build build, const std::shared_ptr<HistoryArena>& arena = {})
    {
        History result;
        if (!count) return result;
        result.arena_ = arena ? arena : std::make_shared<HistoryArena>();
        result.cursor_ = Cursor::load(count, [&](TraceCursorPayload& owners, std::size_t index) {
            auto fill = [&](HistoryPayload& page) { return build(page, index); };
            return owners.retain(result.writer_.rich(fill, result.arena_));
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
    PracticeTraceRef append_packed(const PracticeEventTrace& row, const std::shared_ptr<HistoryArena>& arena)
    {
        auto ref = writer_.packed(row, arena);
        link(ref, arena);
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
        cursor_.append([&](TraceCursorPayload& owners) noexcept { return owners.retain(ref); }, arena);
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
