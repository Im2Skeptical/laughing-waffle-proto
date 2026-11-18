#pragma once

#include <array>
#include <cstddef>
#include <memory_resource>
#include <mutex>

namespace waffle::sim::runtime {

// Shared by a run's histories, or by the new writes of one forecast generation.
// Readers may release snapshots on another thread. This lock protects allocator
// metadata only. Rows and page-local payloads have independent ownership.
class HistoryArena final : public std::pmr::memory_resource {
public:
    struct Stats {
        std::size_t reservedBytes;
        std::size_t usedBytes;
        std::size_t upstreamAllocations;
    };

    ~HistoryArena() override;
    Stats stats() const;

private:
    struct FreeBlock { FreeBlock* next; };
    struct alignas(std::max_align_t) Slab { Slab* next; };
    struct Bucket {
        FreeBlock* recycled{};
        std::byte* next{};
        std::size_t remaining{};
    };

    static constexpr std::size_t minShift = 4;
    static constexpr std::size_t maxShift = 20;
    static constexpr std::size_t slabBlocks = 1024;
    static constexpr std::size_t maxSlabBytes = 8 * 1024 * 1024;
    static_assert((1u << minShift) >= sizeof(FreeBlock));
    static_assert((1u << minShift) >= alignof(Slab));

    mutable std::mutex mutex_;
    Slab* slabs_{};
    std::array<Bucket, maxShift - minShift + 1> buckets_{};
    Stats stats_{0, 0, 0};

    static std::size_t bucket_shift(std::size_t bytes);
    void grow(Bucket& bucket, std::size_t stride);
    void* do_allocate(std::size_t bytes, std::size_t alignment) override;
    void do_deallocate(void* ptr, std::size_t bytes, std::size_t alignment) override;
    bool do_is_equal(const std::pmr::memory_resource& other) const noexcept override { return this == &other; }
};

}
