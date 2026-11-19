#include "core/js_math.hpp"
#include "core/js_number.hpp"
#include "core/json.hpp"
#include "core/rng.hpp"
#include "core/sha256.hpp"

#include <algorithm>
#include <array>
#include <bit>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <iterator>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace {

namespace js = waffle::core::js;
namespace json = waffle::core::json;
using namespace waffle::core;

void expect(bool condition, const std::string& label)
{
    if (!condition) throw std::runtime_error(label);
}

const json::Value& field(const json::Value& object, std::string_view key)
{
    const auto* value = object.find(key);
    if (!value) throw std::runtime_error("missing fixture field " + std::string(key));
    return *value;
}

std::string read_file(const std::filesystem::path& path)
{
    std::ifstream file(path, std::ios::binary);
    if (!file) throw std::runtime_error("could not open " + path.string());
    return {std::istreambuf_iterator<char>(file), {}};
}

std::uint64_t bits_from_hex(std::string_view hex)
{
    const auto end = hex.data() + hex.size();
    std::uint64_t bits;
    const auto result = std::from_chars(hex.data(), end, bits, 16);
    expect(hex.size() == 16 && result.ptr == end && result.ec == std::errc{}, "invalid hex vector");
    return bits;
}

double from_hex(const json::Value& value)
{
    return std::bit_cast<double>(bits_from_hex(value.as_string()));
}

std::string float_hex(double value)
{
    constexpr char hex[] = "0123456789abcdef";
    auto bits = std::isnan(value) ? 0x7ff8000000000000ull : std::bit_cast<std::uint64_t>(value);
    std::string encoded(16, '0');
    for (auto ch = encoded.rbegin(); ch != encoded.rend(); ++ch) {
        *ch = hex[bits & 0xf];
        bits >>= 4;
    }
    return encoded;
}

void check_bits(double actual, const json::Value& expected, const std::string& label)
{
    const auto encoded = float_hex(actual);
    if (encoded != expected.as_string())
        throw std::runtime_error(label + ": expected " + expected.as_string() + ", got " + encoded);
}

void check_numbers(const json::Value& vectors)
{
    for (const auto& entry : field(vectors, "numberFormat").as_array()) {
        const auto& values = entry.as_array();
        const auto& bits = values.at(0);
        const auto& expected = values.at(1);
        const auto value = from_hex(bits);
        const auto text = js::number_to_string(value);
        expect(text == expected.as_string(),
            bits.as_string() + " format: expected " + expected.as_string() + ", got " + text);
        if (std::isfinite(value) && text != "0")
            check_bits(json::parse(text).as_number(), bits, text + " parser round trip");
    }
    for (const auto& entry : field(vectors, "numberOps").as_array()) {
        const auto& values = entry.as_array();
        const auto a = from_hex(values.at(0));
        const auto b = from_hex(values.at(1));
        const auto label = values[0].as_string() + " / " + values[1].as_string() + " ";
        expect(js::to_int32(a) == values.at(2).as_number(), label + "ToInt32");
        expect(js::to_uint32(a) == values.at(3).as_number(), label + "ToUint32");
        expect(js::imul(a, b) == values.at(4).as_number(), label + "Math.imul");
        expect(js::unsigned_shift_right(a, b) == values.at(5).as_number(), label + ">>>");
        check_bits(js::round(a), values.at(6), label + "Math.round");
        check_bits(js::floor(a), values.at(7), label + "Math.floor");
        check_bits(js::ceil(a), values.at(8), label + "Math.ceil");
        check_bits(js::trunc(a), values.at(9), label + "Math.trunc");
        check_bits(js::sign(a), values.at(10), label + "Math.sign");
        check_bits(js::remainder(a, b), values.at(11), label + "%");
    }
    for (const auto& entry : field(vectors, "decimalParse").as_array()) {
        const auto& number = entry.as_array();
        const auto& text = number.at(0).as_string();
        check_bits(json::parse(text).as_number(), number.at(1), text + " parser");
    }
}

void check_math_vectors(const std::filesystem::path& path)
{
    struct Operation {
        std::string_view name;
        double (*unary)(double) noexcept = nullptr;
        double (*binary)(double, double) noexcept = nullptr;
    };
    constexpr Operation operations[] = {
        {"pow", nullptr, js::pow}, {"exp", js::exp}, {"log", js::log}, {"log10", js::log10},
        {"sin", js::sin}, {"cos", js::cos}, {"atan2", nullptr, js::atan2},
        {"hypot", nullptr, js::hypot}, {"sqrt", js::sqrt},
    };
    std::ifstream file(path);
    expect(file.is_open(), "could not open math fixture " + path.string());
    std::string line;
    expect(bool(std::getline(file, line)) && line.starts_with("# v24."), "missing Node 24 math reference");
    std::cout << line << '\n';
    for (const auto& operation : operations) {
        std::string name;
        std::size_t count = 0;
        expect(bool(std::getline(file, line)), "missing math vector section");
        std::istringstream section(line);
        expect(bool(section >> name >> count) && name == operation.name && count >= 20'000,
            "invalid math vector section for " + std::string(operation.name));

        const bool check_legacy = name == "pow";
        const std::size_t input_count = operation.binary ? 2 : 1;
        const std::size_t column_count = input_count + 1 + check_legacy;
        std::size_t default_mismatches = 0;
        std::uint64_t max_ulp = 0;
        for (std::size_t row = 0; row < count; ++row) {
            expect(bool(std::getline(file, line)) && line.size() == 17 * column_count - 1,
                "invalid math vector width");
            const auto field = [&](std::size_t column) {
                return std::string_view(line).substr(column * 17, 16);
            };
            const auto first = std::bit_cast<double>(bits_from_hex(field(0)));
            const double actual = operation.binary
                ? operation.binary(first, std::bit_cast<double>(bits_from_hex(field(1))))
                : operation.unary(first);
            const auto actual_bits = std::bit_cast<std::uint64_t>(actual);
            const auto expected = field(column_count - 1);
            const auto operands = std::string_view(line).substr(0, input_count * 17 - 1);
            if (actual_bits != bits_from_hex(expected)) {
                std::ostringstream error;
                error << name << "(" << operands << ") expected " << expected
                      << ", got " << std::hex << actual_bits;
                throw std::runtime_error(error.str());
            }

            if (check_legacy) {
                const auto default_bits = bits_from_hex(field(input_count));
                if (actual_bits == default_bits) continue;
                const auto default_value = std::bit_cast<double>(default_bits);
                const auto difference = actual_bits > default_bits
                    ? actual_bits - default_bits : default_bits - actual_bits;
                if (!std::isfinite(actual) || !std::isfinite(default_value) ||
                    std::signbit(actual) != std::signbit(default_value) || difference > 1) {
                    std::ostringstream error;
                    error << "pow(" << operands << ") exceeds the default Node 1 ULP allowance: expected "
                          << field(input_count) << ", got " << std::hex << actual_bits;
                    throw std::runtime_error(error.str());
                }
                ++default_mismatches;
                max_ulp = std::max(max_ulp, difference);
            }
        }
        std::cout << name << ": " << count << " exact";
        if (check_legacy) {
            std::cout << " (fdlibm), " << default_mismatches << " default Node mismatches, max " << max_ulp << " ULP";
        }
        std::cout << '\n';
    }
    expect(!std::getline(file, line) && file.eof() && !file.bad(), "trailing math vectors or read failure");
}

void expect_invalid_json(std::string_view input)
{
    try {
        json::parse(input);
    } catch (const std::invalid_argument&) {
        return;
    }
    throw std::runtime_error("invalid JSON accepted (" + std::to_string(input.size()) + " bytes)");
}

void check_json_and_hashes(const json::Value& vectors)
{
    for (const auto& entry : field(vectors, "json").as_array()) {
        const auto& values = entry.as_array();
        const auto& input = values.at(0).as_string();
        const auto value = json::parse(input);
        expect(json::stringify(value) == values.at(1).as_string(), "stringify mismatch: " + input);
        expect(json::canonical_json(value) == values.at(2).as_string(), "canonical JSON mismatch: " + input);
        expect(json::sha256_value(value) == values.at(3).as_string(), "canonical hash mismatch: " + input);
    }
    for (const auto& entry : field(vectors, "malformed").as_array()) expect_invalid_json(entry.as_string());
    for (const auto input : {"\"\x80\"", "\"\xc0\x80\"", "\"\xe0\x9f\x80\"", "\"\xed\xa0\x80\"",
                            "\"\xf4\x90\x80\x80\"", "\"\xf0\x9f\x98\"", "\"\xff\""})
        expect_invalid_json(input);
    for (const auto& entry : field(vectors, "textHashes").as_array()) {
        const auto& hash = entry.as_array();
        const auto& input = hash.at(0).as_string();
        expect(sha256_text(input) == hash.at(1).as_string(),
            "SHA-256 text mismatch for " + std::to_string(input.size()) + " bytes");
    }
    expect(json::stringify(json::Value(nullptr)) == "null", "stringify null");
    expect(json::stringify(json::Value(std::numeric_limits<double>::quiet_NaN())) == "null", "stringify NaN");
    expect(json::stringify(json::Value(-std::numeric_limits<double>::infinity())) == "null", "stringify -Infinity");
}

struct Stream {
    std::string_view name;
    RngStream stream;
    std::uint32_t RngState::* field;
};

constexpr std::array streams{
    Stream{"seed", RngStream::main, &RngState::seed},
    Stream{"vassalSeed", RngStream::vassal, &RngState::vassalSeed},
    Stream{"vassalDevelopmentSeed", RngStream::vassalDevelopment, &RngState::vassalDevelopmentSeed},
    Stream{"vassalLifeMapSeed", RngStream::vassalLifeMap, &RngState::vassalLifeMapSeed},
    Stream{"vassalPortraitSeed", RngStream::vassalPortrait, &RngState::vassalPortraitSeed},
};

void check_rng(const json::Value& vectors)
{
    std::vector<std::array<double, 2>> bounds;
    for (const auto& entry : field(vectors, "rngBounds").as_array())
        bounds.push_back({from_hex(entry.as_array().at(0)), from_hex(entry.as_array().at(1))});
    const auto batch_size = static_cast<std::size_t>(field(vectors, "batchSize").as_number());

    for (const auto& entry : field(vectors, "rng").as_array()) {
        const auto& values = entry.as_array();
        const auto& name = values.at(0).as_string();
        const auto& helper = values.at(1).as_string();
        const auto seed = from_hex(values.at(2));
        const auto label = name + " " + helper + " seed " + values[2].as_string();
        const bool standalone = name == "standalone";
        const bool draw_int = helper == "int";
        const auto stream = std::find_if(streams.begin(), streams.end(), [&](const Stream& s) {
            return s.name == name;
        });
        RngState state{11, 1867, 22, 33, 44, 55};
        auto seed_state = create_rng(seed);
        if (standalone) {
            check_bits(seed_state.seed, values.at(3), label + " initial seed");
        } else {
            expect(stream != streams.end(), "unknown RNG stream " + name);
            state.*(stream->field) = js::to_uint32(seed);
        }
        std::size_t draw = 0;
        for (const auto& batch : values.at(4).as_array()) {
            const auto& expected = batch.as_array();
            std::string output;
            output.reserve(batch_size * 16);
            for (std::size_t i = 0; i < batch_size; ++i, ++draw) {
                const auto [min, max] = bounds.at(draw % bounds.size());
                const double next = standalone
                    ? (draw_int ? rng_next_int(seed_state, min, max) : rng_next_float(seed_state))
                    : (draw_int ? rng_next_int(state, min, max, stream->stream) : rng_next_float(state, stream->stream));
                output += float_hex(next);
            }
            const auto batch_label = label + " through draw " + std::to_string(draw);
            expect(sha256_text(output) == expected.at(0).as_string(), batch_label + " result hash");
            if (!standalone)
                expect(json::stringify(serialize_rng(state)) == expected.at(1).as_string(),
                    batch_label + " serialized RNG");
        }
    }
}

void check_rng_counts()
{
    constexpr std::array<std::uint32_t, 5> seeds{
        0, 1, 0u - rng_seed_increment, 1u - rng_seed_increment, UINT32_MAX};
    constexpr std::array probabilities{0.0, 0x1p-33, 0.02, 0.5, 1.0 - 0x1p-40, 1.0};
    for (const auto seed : seeds) {
        for (const double probability : probabilities) {
            for (const std::uint64_t draws : {0, 1, 512, 513}) {
                RngState scalar{seed, 1, 2, 3, 4, 5};
                auto bulk = scalar;
                std::uint64_t expected = 0;
                for (std::uint64_t i = 0; i < draws; ++i)
                    expected += rng_next_float(scalar, RngStream::main) < probability;
                expect(rng_count_below(bulk, draws, probability) == expected &&
                       json::stringify(serialize_rng(bulk)) == json::stringify(serialize_rng(scalar)),
                       "bulk draws must preserve scalar counts and RNG state");
            }
        }
    }
}

void check_states(const std::filesystem::path& manifest)
{
    const auto states = json::parse(read_file(manifest));
    expect(!states.as_array().empty(), "empty state manifest");
    for (const auto& state : states.as_array()) {
        const auto& file = field(state, "file").as_string();
        const auto& hash = field(state, "sha256").as_string();
        const auto text = read_file(manifest.parent_path() / file);
        const auto value = json::parse(text);
        const auto written = json::stringify(value);
        const auto difference = std::mismatch(text.begin(), text.end(), written.begin(), written.end());
        expect(difference.first == text.end() && difference.second == written.end(),
            file + " differs from JSON.stringify at byte " + std::to_string(difference.first - text.begin()));
        const auto actual = json::sha256_value(value);
        expect(actual == hash, file + " SHA-256 expected " + hash + ", got " + actual);
    }
    std::cout << "Verified " << states.as_array().size() << " real state(s)\n";
}

}

int main(int argc, char** argv)
try {
    expect(argc == 3, "usage: waffle_core_tests vectors|states|math INPUT_FILE");
    const std::string_view mode(argv[1]);
    if (mode == "vectors") {
        const auto vectors = json::parse(read_file(argv[2]));
        check_numbers(vectors);
        check_json_and_hashes(vectors);
        check_rng(vectors);
        check_rng_counts();
    } else if (mode == "states") {
        check_states(argv[2]);
    } else if (mode == "math") {
        check_math_vectors(argv[2]);
    } else {
        throw std::runtime_error("unknown test mode");
    }
    return 0;
} catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
}
