#pragma once

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace waffle::connected {

struct MapArtwork;
struct CrestArtwork;

struct Artwork {
    std::string css;
    std::map<std::string, std::string, std::less<>> sprites;
    std::vector<unsigned char> rgba;
    int width{}, height{};
    std::shared_ptr<const MapArtwork> map;
    std::shared_ptr<const CrestArtwork> crests;
};

Artwork prepareArtwork();

}
