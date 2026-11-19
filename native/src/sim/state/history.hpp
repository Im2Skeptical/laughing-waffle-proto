#pragma once

#include "sim/state/history_arena.hpp"
#include "sim/state/tables.hpp"

#include <algorithm>
#include <atomic>
#include <cassert>
#include <memory>
#include <new>
#include <utility>

namespace waffle::sim::runtime {

struct HistoryPayload;

namespace history_detail {

struct Node {
    explicit Node(const std::shared_ptr<HistoryArena>& arena) : arena(arena) {}
    std::shared_ptr<HistoryArena> arena;
    std::atomic<std::size_t> references{1};
};

// A release by a departing snapshot synchronizes with the next unique()
// before the writer can modify storage that snapshot previously read.
template<class T>
class Handle {
    T* value_{};

public:
    Handle() = default;
    Handle(const Handle& other) : value_(other.value_)
    {
        if (value_) value_->references.fetch_add(1, std::memory_order_relaxed);
    }
    Handle(Handle&& other) noexcept : value_(std::exchange(other.value_, nullptr)) {}
    Handle& operator=(Handle other) noexcept
    {
        std::swap(value_, other.value_);
        return *this;
    }
    ~Handle()
    {
        if (!value_ || value_->references.fetch_sub(1, std::memory_order_acq_rel) != 1) return;
        auto arena = std::move(value_->arena);
        std::destroy_at(value_);
        arena->deallocate(value_, sizeof(T), alignof(T));
    }

    template<class... Args>
    static Handle make(const std::shared_ptr<HistoryArena>& arena, Args&&... args)
    {
        void* storage = arena->allocate(sizeof(T), alignof(T));
        try {
            Handle result;
            result.value_ = ::new (storage) T(arena, std::forward<Args>(args)...);
            return result;
        } catch (...) {
            arena->deallocate(storage, sizeof(T), alignof(T));
            throw;
        }
    }

    explicit operator bool() const { return value_ != nullptr; }
    const T* operator->() const { return value_; }
    const T& operator*() const { return *value_; }
    bool unique() const { return value_->references.load(std::memory_order_acquire) == 1; }
    T& write() const
    {
        assert(unique());
        return *value_;
    }
};

}

// One worker appends. A separate published cursor can be read, copied or
// destroyed concurrently. Publish it with a thread handoff and never read or
// copy the writer's cursor until writes stop. References obtained from a
// cursor are valid until that cursor changes or is destroyed.
template<class Row, std::uint32_t Limit, class Field, class Payload = HistoryPayload>
class History {
    static constexpr std::size_t pageSize = 16;
    // A ring needs room for its partial front page and one new page before eviction.
    static constexpr std::size_t directorySize = Limit ? (Limit + pageSize - 2) / pageSize + 2 : 32;

    struct Page : history_detail::Node {
        explicit Page(const std::shared_ptr<HistoryArena>& arena)
            : Node(arena), payload(make_payload(arena.get())) {}
        Page(const std::shared_ptr<HistoryArena>& arena, const Page& source)
            : Node(arena), payload(copy_payload(source.payload, arena.get())), count(source.count)
        {
            std::copy_n(source.rows.begin(), count, rows.begin());
        }

        std::array<Row, pageSize> rows;
        Payload payload;
        std::size_t count{};

    private:
        static Payload make_payload(std::pmr::memory_resource* resource)
        {
            if constexpr (std::is_constructible_v<Payload, std::pmr::memory_resource*>)
                return Payload(resource);
            else
                return Payload{};
        }

        static Payload copy_payload(const Payload& source, std::pmr::memory_resource* resource)
        {
            if constexpr (std::is_constructible_v<Payload, const Payload&, std::pmr::memory_resource*>)
                return Payload(source, resource);
            else
                return source;
        }
    };

    using PageHandle = history_detail::Handle<Page>;

    struct Directory : history_detail::Node {
        using Link = history_detail::Handle<Directory>;

        explicit Directory(const std::shared_ptr<HistoryArena>& arena) : Node(arena) {}
        Directory(const std::shared_ptr<HistoryArena>& arena, const Directory& source)
            : Node(arena), pages(source.pages), previous(source.previous), count(source.count) {}

        ~Directory()
        {
            // Release a long private chain iteratively. Shared chunks stay live.
            while (previous && previous.unique()) {
                auto older = std::move(previous.write().previous);
                previous = std::move(older);
            }
        }

        std::array<PageHandle, directorySize> pages;
        Link previous;
        std::size_t count{};
    };

    using DirectoryHandle = typename Directory::Link;
    DirectoryHandle directory_;
    std::size_t size_{};
    std::size_t first_{};

public:
    using Name = Field;
    std::size_t size() const { return directory_ ? size_ : 0; }

    // Drop the rows while retaining the arena for the next append. A
    // published copy keeps its original directory and pages.
    void clear()
    {
        if (!directory_ || size_ == 0) return;
        if (directory_.unique()) {
            auto& directory = directory_.write();
            if constexpr (std::is_same_v<Payload, HistoryPayload> && std::is_trivially_destructible_v<Row>) {
                if (directory.count == 1 && !directory.previous && directory.pages[0].unique()) {
                    auto& page = directory.pages[0].write();
                    page.payload.rollback({});
                    page.count = 0;
                    size_ = first_ = 0;
                    return;
                }
            }
            for (std::size_t i = 0; i < directory.count; ++i) directory.pages[i] = {};
            directory.previous = {};
            directory.count = 0;
        } else {
            directory_ = DirectoryHandle::make(directory_->arena);
        }
        size_ = first_ = 0;
    }

    const Row& at(std::size_t index) const
    {
        if (index >= size()) throw std::out_of_range("runtime history index");
        const auto position = first_ + index;
        return page_at(position / pageSize)->rows[position % pageSize];
    }

    // Import preserves the exact input window, even for a capture larger than
    // the writer's retention limit. The next append applies that limit.
    template<class Build>
    static History load(std::size_t count, Build build, const std::shared_ptr<HistoryArena>& emptyArena = {})
    {
        History result;
        for (std::size_t index = 0; index < count; ++index) {
            auto row = [&](Payload& payload) { return build(payload, index); };
            result.append_record(row, emptyArena ? &emptyArena : nullptr);
        }
        return result;
    }

    // A builder returns a row or fills the unpublished row and its payload.
    template<class Build>
    void append(Build build, const std::shared_ptr<HistoryArena>& emptyArena = {})
    {
        if constexpr (Limit != 0) {
            if (size() > Limit) {
                auto trimmed = newest(Limit - 1);
                trimmed.append_record(build, &directory_->arena);
                *this = std::move(trimmed);
                return;
            }
        }
        append_record(build, emptyArena ? &emptyArena : nullptr);
        if constexpr (Limit != 0) {
            if (size_ > Limit) {
                --size_;
                if (++first_ == pageSize) {
                    auto& directory = directory_.write();
                    auto& pages = directory.pages;
                    std::move(pages.begin() + 1, pages.begin() + directory.count, pages.begin());
                    pages[--directory.count] = {};
                    first_ = 0;
                }
            }
        }
    }

    void push(Row row)
    {
        append([&](auto&) noexcept(std::is_nothrow_copy_constructible_v<Row>) { return row; });
    }

    template<class Visit>
    void for_each(Visit visit) const
    {
        if (!directory_) return;
        auto first = first_;
        visit_directory(*directory_, first, visit);
    }

    std::size_t live_bytes() const
    {
        std::size_t bytes = 0;
        for (auto* chunk = directory_.operator->(); chunk; chunk = chunk->previous.operator->()) {
            bytes += sizeof(Directory);
            for (std::size_t i = 0; i < chunk->count; ++i) {
                const auto& page = *chunk->pages[i];
                bytes += sizeof(Page) - sizeof(page.rows) + page.count * sizeof(Row) + page.payload.live_bytes();
            }
        }
        return bytes;
    }

private:
    template<class Visit>
    static void visit_directory(const Directory& directory, std::size_t& first, Visit& visit)
    {
        if (directory.previous) visit_directory(*directory.previous, first, visit);
        for (std::size_t pageIndex = 0; pageIndex < directory.count; ++pageIndex) {
            const auto& page = *directory.pages[pageIndex];
            for (std::size_t index = first; index < page.count; ++index)
                visit(page.rows[index], page.payload);
            first = 0;
        }
    }

    const PageHandle& page_at(std::size_t index) const
    {
        auto fromEnd = (first_ + size_ - 1) / pageSize - index;
        auto* chunk = &*directory_;
        while (fromEnd >= chunk->count) {
            fromEnd -= chunk->count;
            chunk = &*chunk->previous;
        }
        return chunk->pages[chunk->count - 1 - fromEnd];
    }

    History newest(std::size_t count) const
    {
        History result;
        if (count == 0) return result;
        result.size_ = count;
        const auto start = first_ + size_ - count;
        result.first_ = start % pageSize;
        result.directory_ = DirectoryHandle::make(directory_->arena);
        auto& dir = result.directory_.write();
        for (auto page = start / pageSize; page <= (first_ + size_ - 1) / pageSize; ++page)
            dir.pages[dir.count++] = page_at(page);
        return result;
    }

    template<class Build>
    void append_record(Build& build, const std::shared_ptr<HistoryArena>* inheritedArena = nullptr)
    {
        std::shared_ptr<HistoryArena> newArena;
        if (!directory_) newArena = inheritedArena ? *inheritedArena : std::make_shared<HistoryArena>();
        const auto& arena = directory_ ? directory_->arena : newArena;
        const auto oldSize = size();
        const bool extend = directory_ && directory_->count != 0 &&
            directory_->pages[directory_->count - 1]->count < pageSize;
        DirectoryHandle replacement;
        if (!directory_ || (!extend && directory_->count == directorySize)) {
            replacement = DirectoryHandle::make(arena);
            replacement.write().previous = directory_;
        } else if (!directory_.unique()) {
            replacement = DirectoryHandle::make(arena, *directory_);
        }

        auto& target = replacement ? replacement.write() : directory_.write();
        auto& slot = target.pages[extend ? target.count - 1 : target.count];
        if (extend && slot.unique()) {
            // A builder adds page-local payloads. Existing offsets and values
            // remain valid, including if a builder fails before publishing its row.
            if constexpr ((std::is_nothrow_invocable_r_v<Row, Build&, Payload&> &&
                           std::is_nothrow_move_assignable_v<Row>) ||
                          std::is_nothrow_invocable_v<Build&, Row&, Payload&>) {
                add_row(slot.write(), build);
            } else if constexpr (requires(Payload& payload) { payload.rollback(payload.checkpoint()); }) {
                auto& page = slot.write();
                const auto checkpoint = page.payload.checkpoint();
                try {
                    add_row(page, build);
                } catch (...) {
                    page.payload.rollback(checkpoint);
                    throw;
                }
            } else {
                // Preserve the previous API for custom payloads without rollback.
                auto page = PageHandle::make(arena, *slot);
                add_row(page.write(), build);
                slot = std::move(page);
            }
        } else {
            auto page = extend ? PageHandle::make(arena, *slot) : PageHandle::make(arena);
            add_row(page.write(), build);
            slot = std::move(page);
        }
        if (!extend) ++target.count;
        if (replacement) directory_ = std::move(replacement);
        if (oldSize == 0) first_ = 0;
        size_ = oldSize + 1;
    }

    template<class Build>
    static void add_row(Page& page, Build& build)
    {
        if constexpr (std::is_invocable_v<Build&, Row&, Payload&>)
            build(page.rows[page.count], page.payload);
        else
            page.rows[page.count] = build(page.payload);
        ++page.count;
    }
};

template<class Row, std::uint32_t Limit, class Field>
struct HistoryRef {
    using Storage = History<Row, Limit, Field>;
    using Element = Row;
    using Name = Field;
    Index<Storage> row;
};

// Replacement fields use the same publication rule as history pages.
template<class T, class Field>
class ColdValue {
    std::shared_ptr<const T> value_;

public:
    using Name = Field;
    explicit ColdValue(const T& value) : value_(std::make_shared<const T>(value)) {}
    const T& get() const { return *value_; }
    void replace(const T& value) { value_ = std::make_shared<const T>(value); }
};

template<class T, class Field>
struct ColdRef {
    using Storage = ColdValue<T, Field>;
    Index<Storage> row;
};

}
