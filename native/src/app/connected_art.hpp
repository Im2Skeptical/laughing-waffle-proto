#pragma once

#include <map>
#include <string>
#include <vector>

namespace waffle::connected {

struct Artwork {
    std::string css;
    std::map<std::string, std::string, std::less<>> sprites;
    std::vector<unsigned char> rgba;
    int width{}, height{};
};

Artwork prepareArtwork();

}
