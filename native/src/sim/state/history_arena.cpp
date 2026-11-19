#include "sim/state/history_arena.hpp"

#include <algorithm>
#include <bit>
#include <new>

namespace waffle::sim::runtime {

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

void HistoryArena::grow(Bucket& bucket, std::size_t stride)
{
    // Small histories start with a short slab. Grow geometrically up to
    // the block and byte caps, and prefer recycled blocks to further growth.
    const auto count = std::min(bucket.nextSlabBlocks, maxSlabBytes / stride);
    const auto bytes = sizeof(Slab) + count * stride;
    auto* storage = static_cast<std::byte*>(::operator new(bytes));
    slabs_ = ::new (storage) Slab{slabs_};
    bucket.next = storage + sizeof(Slab);
    bucket.remaining = count;
    bucket.nextSlabBlocks = std::min(count * 2, slabBlocks);
}

void* HistoryArena::do_allocate(std::size_t bytes, std::size_t alignment)
{
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab))
        return std::pmr::new_delete_resource()->allocate(bytes, alignment);

    std::lock_guard lock(mutex_);
    auto& bucket = buckets_[shift - minShift];
    const std::size_t stride = std::size_t{1} << shift;
    if (auto* block = bucket.recycled) {
        bucket.recycled = block->next;
        return block;
    }
    if (bucket.remaining == 0) grow(bucket, stride);
    auto* block = bucket.next;
    bucket.next += stride;
    --bucket.remaining;
    return block;
}

void HistoryArena::do_deallocate(void* ptr, std::size_t bytes, std::size_t alignment)
{
    const auto shift = bucket_shift(bytes);
    if (shift > maxShift || alignment > alignof(Slab)) {
        std::pmr::new_delete_resource()->deallocate(ptr, bytes, alignment);
        return;
    }
    std::lock_guard lock(mutex_);
    auto& bucket = buckets_[shift - minShift];
    bucket.recycled = ::new (ptr) FreeBlock{bucket.recycled};
}

}
