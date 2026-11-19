#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <memory_resource>
#include <mutex>

namespace waffle::sim::runtime {

// An arena lives as long as any history cursor or page using it. Readers may
// release snapshots on another thread, so recycling protects slab metadata.
// Page reads do not touch the allocator.
class HistoryArena final : public std::pmr::memory_resource {
public:
    explicit HistoryArena(std::size_t firstSlabBlocks = 8, std::size_t smallPayloadBlocks = 0);
    ~HistoryArena() override;

    struct Storage {
        std::size_t retained{}, live{}, recycled{};
    };

    std::size_t retained_bytes() const noexcept { return retained_.load(std::memory_order_relaxed); }
    Storage storage() const;

    struct GrowthLimitReached {};

    // Applies to new reservations on this thread only. Reusing a recycled
    // block is free. Speculative callers can abandon an unpublished step.
    class GrowthLimit {
    public:
        explicit GrowthLimit(std::size_t bytes) noexcept;
        ~GrowthLimit();
        GrowthLimit(const GrowthLimit&) = delete;
        GrowthLimit& operator=(const GrowthLimit&) = delete;

    private:
        std::size_t remaining_;
        GrowthLimit* previous_;
        friend class HistoryArena;
    };

private:
    struct FreeBlock { FreeBlock* next; };
    struct alignas(std::max_align_t) Slab { Slab* next; };
    struct Bucket {
        FreeBlock* recycled{};
        std::byte* next{};
        std::size_t remaining{};
        std::size_t nextSlabBlocks{8};
    };

    static constexpr std::size_t minShift = 4;
    static constexpr std::size_t maxShift = 20;
    static constexpr std::size_t slabBlocks = 1024;
    static constexpr std::size_t maxSlabBytes = 8 * 1024 * 1024;
    static_assert((1u << minShift) >= sizeof(FreeBlock));
    static_assert((1u << minShift) >= alignof(Slab));

    mutable std::mutex mutex_;
    std::atomic_size_t retained_{};
    std::size_t live_{}, recycled_{};
    Slab* slabs_{};
    std::array<Bucket, maxShift - minShift + 1> buckets_{};

    static std::size_t bucket_shift(std::size_t bytes);
    static void admit_growth(std::size_t bytes);
    void grow(Bucket& bucket, std::size_t stride);
    void* do_allocate(std::size_t bytes, std::size_t alignment) override;
    void do_deallocate(void* ptr, std::size_t bytes, std::size_t alignment) override;
    bool do_is_equal(const std::pmr::memory_resource& other) const noexcept override { return this == &other; }
};

}
