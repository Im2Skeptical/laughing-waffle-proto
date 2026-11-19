#include "sim/state/history_arena.hpp"

#include <algorithm>
#include <bit>
#include <new>

namespace waffle::sim::runtime {
namespace {
thread_local HistoryArena::GrowthLimit* growthLimit;
}

HistoryArena::GrowthLimit::GrowthLimit(std::size_t bytes) noexcept
    : remaining_(bytes), previous_(growthLimit)
{
    growthLimit = this;
}

HistoryArena::GrowthLimit::~GrowthLimit()
{
    growthLimit = previous_;
}

void HistoryArena::admit_growth(std::size_t bytes)
{
    if (!growthLimit) return;
    if (bytes > growthLimit->remaining_) throw GrowthLimitReached{};
    growthLimit->remaining_ -= bytes;
}

HistoryArena::HistoryArena(std::size_t firstSlabBlocks, std::size_t smallPayloadBlocks)
{
    for (std::size_t i = 0; i < buckets_.size(); ++i) {
        const auto stride = std::size_t{1} << (minShift + i);
        const auto blocks = stride <= 128 ? std::max(firstSlabBlocks, smallPayloadBlocks) : firstSlabBlocks;
        buckets_[i].nextSlabBlocks = std::clamp(blocks, std::size_t{1}, slabBlocks);
    }
}

HistoryArena::~HistoryArena()
{
    while (slabs_) {
        auto* slab = slabs_;
        slabs_ = slab->next;
        ::operator delete(slab);
    }
}

std::size_t HistoryArena::bucket_shift(std::size_t bytes)
{
    return std::bit_width(std::max(bytes, std::size_t{1} << minShift) - 1);
}

HistoryArena::Storage HistoryArena::storage() const
{
    const std::lock_guard lock(mutex_);
    return {retained_bytes(), live_, recycled_};
}

void HistoryArena::grow(Bucket& bucket, std::size_t stride)
{
    // Small histories start with a short slab. Grow geometrically up to
    // the block and byte caps, and prefer recycled blocks to further growth.
    const auto count = std::min(bucket.nextSlabBlocks, maxSlabBytes / stride);
    const auto bytes = sizeof(Slab) + count * stride;
    admit_growth(bytes);
    auto* storage = static_cast<std::byte*>(::operator new(bytes));
    slabs_ = ::new (storage) Slab{slabs_};
    retained_.fetch_add(bytes, std::memory_order_relaxed);
    bucket.next = storage + sizeof(Slab);
    bucket.remaining = count;
    bucket.nextSlabBlocks = std::min(count * 2, slabBlocks);
}

void* HistoryArena::do_allocate(std::size_t bytes, std::size_t alignment)
{
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab)) {
        admit_growth(bytes);
        auto* memory = std::pmr::new_delete_resource()->allocate(bytes, alignment);
        const std::lock_guard lock(mutex_);
        retained_.fetch_add(bytes, std::memory_order_relaxed);
        live_ += bytes;
        return memory;
    }

    std::lock_guard lock(mutex_);
    auto& bucket = buckets_[shift - minShift];
    const std::size_t stride = std::size_t{1} << shift;
    if (auto* block = bucket.recycled) {
        bucket.recycled = block->next;
        live_ += stride;
        recycled_ -= stride;
        return block;
    }
    if (bucket.remaining == 0) grow(bucket, stride);
    auto* block = bucket.next;
    bucket.next += stride;
    --bucket.remaining;
    live_ += stride;
    return block;
}

void HistoryArena::do_deallocate(void* ptr, std::size_t bytes, std::size_t alignment)
{
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab)) {
        std::pmr::new_delete_resource()->deallocate(ptr, bytes, alignment);
        const std::lock_guard lock(mutex_);
        retained_.fetch_sub(bytes, std::memory_order_relaxed);
        live_ -= bytes;
        return;
    }
    std::lock_guard lock(mutex_);
    auto& bucket = buckets_[shift - minShift];
    bucket.recycled = ::new (ptr) FreeBlock{bucket.recycled};
    const auto stride = std::size_t{1} << shift;
    live_ -= stride;
    recycled_ += stride;
}

}
