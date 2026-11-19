#pragma once

#include "timegraph/forecast.hpp"

#include <atomic>

namespace waffle::timegraph::detail {

// Charges live allocated payload and container capacity, including shared
// blocks still leased by a pending restore. Bookkeeping is outside sim.
struct Charge {
    std::atomic_size_t& account;
    std::size_t bytes;
    Charge(std::atomic_size_t& account, std::size_t bytes) : account(account), bytes(bytes) { account += bytes; }
    ~Charge() { account -= bytes; }
    Charge(const Charge&) = delete;
    Charge& operator=(const Charge&) = delete;
};

inline constexpr std::size_t anchorBlockBytes = 4096;

std::size_t runtime_bytes(const sim::RuntimeState& state);

class Anchor {
public:
    Anchor(std::atomic_size_t& account, sim::RuntimeState& state, const Anchor* previous);
    Second second() const { return static_cast<Second>(sidecar_.hot.tSec); }
    sim::RuntimeState copy() const;

private:
    struct Block {
        Charge charge;
        std::vector<std::byte> bytes;
        Block(std::atomic_size_t& account, std::span<const std::byte> source);
    };
    using Blocks = std::vector<std::shared_ptr<const Block>>;
    struct Column {
        std::size_t elements{};
        std::size_t privateOffset{};
        Blocks blocks;
    };

    template<class Vector>
    void store(std::atomic_size_t& account, const Vector& column, const Anchor* previous);
    template<class Vector>
    void load(Vector& column, const Column& source) const;

    sim::RuntimeState sidecar_;
    std::vector<Column> columns_;
    std::vector<std::byte> privateColumns_;
    std::optional<Charge> charge_;
};

}
