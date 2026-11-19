#pragma once

#include <cstdio>
#include <string>
#include <string_view>

namespace waffle::connected::markup {

inline std::string escape(std::string_view text)
{
    std::string result;
    for (char c : text) {
        switch (c) {
            case '<': result += "&lt;"; break;
            case '>': result += "&gt;"; break;
            case '&': result += "&amp;"; break;
            case '"': result += "&quot;"; break;
            default: result += c;
        }
    }
    return result;
}

inline std::string number(double value, int precision = 0)
{
    char buffer[48];
    std::snprintf(buffer, sizeof(buffer), "%.*f", precision, value);
    return buffer;
}

inline std::string button(std::string_view op, std::string_view id, std::string_view label,
                   std::string_view classes = "decision", std::string_view help = {}, bool disabled = false)
{
    return "<button class=\"button " + std::string(classes) + (disabled ? " disabled" : "") +
        "\" data-op=\"" + std::string(op) + "\" data-id=\"" + escape(id) +
        "\" data-help=\"" + escape(help) + (disabled ? "\" disabled=\"disabled" : "") +
        "\">" + escape(label) + "</button>";
}

}
