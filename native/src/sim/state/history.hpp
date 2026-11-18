#pragma once

#include "sim/state/tables.hpp"

#include <algorithm>
#include <memory>

namespace waffle::sim::runtime {

struct HistoryPayload;

// Pages and directories become immutable before publication. A branch owns
// its cursor and publishes a fresh directory and tail page on append.
template<class Row, std::uint32_t Limit, class Field, class Payload = HistoryPayload>
class History {
    static constexpr std::size_t pageSize = 16;

    struct Page {
        std::vector<Row> rows;
        Payload payload;
    };

    struct Directory {
        std::vector<std::shared_ptr<const Page>> pages;
        std::size_t first{};
        std::size_t size{};
    };

    std::shared_ptr<const Directory> directory_;

public:
    using Name = Field;
    std::size_t size() const { return directory_ ? directory_->size : 0; }

    const Row& at(std::size_t index) const
    {
        if (index >= size()) throw std::out_of_range("runtime history index");
        const auto position = directory_->first + index;
        return directory_->pages[position / pageSize]->rows[position % pageSize];
    }

    // Import preserves the exact input window, even for a capture larger than
    // the writer's retention limit. The next append applies that limit.
    template<class Build>
    static History load(std::size_t count, Build build)
    {
        History result;
        if (!count) return result;
        auto directory = std::make_shared<Directory>();
        directory->size = count;
        for (std::size_t offset = 0; offset < count;) {
            Page page;
            const auto end = offset + std::min(pageSize, count - offset);
            page.rows.reserve(end - offset);
            while (offset < end) page.rows.push_back(build(page.payload, offset++));
            directory->pages.push_back(std::make_shared<const Page>(page));
        }
        result.directory_ = std::move(directory);
        return result;
    }

    template<class Build>
    void append(Build build)
    {
        auto directory = directory_ ? std::make_shared<Directory>(*directory_) : std::make_shared<Directory>();
        auto& pages = directory->pages;
        const bool extend = !pages.empty() && pages.back()->rows.size() < pageSize;
        auto tail = extend ? *pages.back() : Page{};
        tail.rows.reserve(pageSize);
        tail.rows.push_back(build(tail.payload));
        auto page = std::make_shared<const Page>(tail);
        if (extend) pages.back() = std::move(page);
        else pages.push_back(std::move(page));
        ++directory->size;
        if constexpr (Limit != 0) {
            if (directory->size > Limit) {
                directory->first += directory->size - Limit;
                const auto expiredPages = directory->first / pageSize;
                pages.erase(pages.begin(), pages.begin() + expiredPages);
                directory->first %= pageSize;
                directory->size = Limit;
            }
        }
        directory_ = std::move(directory);
    }

    void push(Row row) { append([&](auto&) { return row; }); }

    template<class Visit>
    void for_each(Visit visit) const
    {
        if (!directory_) return;
        std::size_t first = directory_->first;
        for (const auto& page : directory_->pages) {
            for (std::size_t index = first; index < page->rows.size(); ++index)
                visit(page->rows[index], page->payload);
            first = 0;
        }
    }

    std::size_t live_bytes() const
    {
        if (!directory_) return 0;
        auto bytes = sizeof(Directory);
        for (const auto& page : directory_->pages) {
            bytes += sizeof(page) + sizeof(Page) + page->rows.size() * sizeof(Row) + page->payload.live_bytes();
        }
        return bytes;
    }
};

template<class Row, std::uint32_t Limit, class Field>
struct HistoryRef {
    using Storage = History<Row, Limit, Field>;
    using Element = Row;
    using Name = Field;
    Index<Storage> row;
};

// Replacement fields use the same publication rule as history pages.
template<class T, class Field>
class ColdValue {
    std::shared_ptr<const T> value_;

public:
    using Name = Field;
    explicit ColdValue(const T& value) : value_(std::make_shared<const T>(value)) {}
    const T& get() const { return *value_; }
    void replace(const T& value) { value_ = std::make_shared<const T>(value); }
};

template<class T, class Field>
struct ColdRef {
    using Storage = ColdValue<T, Field>;
    Index<Storage> row;
};

}
