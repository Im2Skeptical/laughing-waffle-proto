#pragma once

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace waffle::connected {

struct MapArtwork;

struct Artwork {
    std::string css;
    std::map<std::string, std::string, std::less<>> sprites;
    std::vector<unsigned char> rgba;
    int width{}, height{};
    std::shared_ptr<const MapArtwork> map;
};

Artwork prepareArtwork();

}
