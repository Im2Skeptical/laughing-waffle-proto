#include "sim/state/history_arena.hpp"

#include <algorithm>
#include <bit>
#include <cassert>
#include <new>

namespace waffle::sim::runtime {

HistoryArena::~HistoryArena()
{
    assert(stats_.usedBytes == 0);
    while (slabs_) {
        auto* slab = slabs_;
        slabs_ = slab->next;
        ::operator delete(slab);
    }
}

HistoryArena::Stats HistoryArena::stats() const
{
    std::lock_guard lock(mutex_);
    return stats_;
}

std::size_t HistoryArena::bucket_shift(std::size_t bytes)
{
    return std::bit_width(std::max(bytes, std::size_t{1} << minShift) - 1);
}

void HistoryArena::grow(Bucket& bucket, std::size_t stride)
{
    // Every built-in row page fits a class with 1,024 blocks per slab.
    // Larger variable payloads use shorter slabs to bound spare capacity.
    const auto count = std::min(slabBlocks, maxSlabBytes / stride);
    const auto bytes = sizeof(Slab) + count * stride;
    auto* storage = static_cast<std::byte*>(::operator new(bytes));
    slabs_ = ::new (storage) Slab{slabs_};
    bucket.next = storage + sizeof(Slab);
    bucket.remaining = count;
    stats_.reservedBytes += bytes;
    ++stats_.upstreamAllocations;
}

void* HistoryArena::do_allocate(std::size_t bytes, std::size_t alignment)
{
    std::lock_guard lock(mutex_);
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab)) {
        auto* block = std::pmr::new_delete_resource()->allocate(bytes, alignment);
        stats_.reservedBytes += bytes;
        stats_.usedBytes += bytes;
        ++stats_.upstreamAllocations;
        return block;
    }

    auto& bucket = buckets_[shift - minShift];
    const std::size_t stride = std::size_t{1} << shift;
    if (auto* block = bucket.recycled) {
        bucket.recycled = block->next;
        stats_.usedBytes += stride;
        return block;
    }
    if (bucket.remaining == 0) grow(bucket, stride);
    auto* block = bucket.next;
    bucket.next += stride;
    --bucket.remaining;
    stats_.usedBytes += stride;
    return block;
}

void HistoryArena::do_deallocate(void* ptr, std::size_t bytes, std::size_t alignment)
{
    std::lock_guard lock(mutex_);
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab)) {
        std::pmr::new_delete_resource()->deallocate(ptr, bytes, alignment);
        stats_.reservedBytes -= bytes;
        stats_.usedBytes -= bytes;
        return;
    }
    auto& bucket = buckets_[shift - minShift];
    bucket.recycled = ::new (ptr) FreeBlock{bucket.recycled};
    stats_.usedBytes -= std::size_t{1} << shift;
}

}
