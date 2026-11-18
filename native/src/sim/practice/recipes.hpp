#pragma once

#include "sim/practice/stock.hpp"

namespace waffle::sim::practice::detail {

struct Candidate {
    SiteId site;
    std::uint32_t slot;
    PracticeId definition;
};

bool eligible(const RuntimeState& state, const Site& site, bool discharge);
bool attempt(RuntimeState& state, Candidate candidate, content::Activation activation,
             bool localOnly, std::optional<PracticeEvent> parent = {},
             bool* blocked = nullptr, bool* already = nullptr);
double threshold(const RuntimeState& state, const Site& site, const content::PracticeDefinition& def, bool scholar);
double charge_gain(const RuntimeState& state, const Site& site, const content::PracticeDefinition& def,
                   Assignment assignment);

void drain_retries(RuntimeState& state, std::span<const Candidate> retries, content::Activation activation);

}
