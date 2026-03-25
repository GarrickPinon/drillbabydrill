#pragma once

#include "market_data_types.hpp"
#include <algorithm>
#include <map>
#include <vector>


namespace hft::data {

// A simple L2 Order Book
// Optimized for readability and correctness.
// In strict HFT, we might use flat arrays or fixed-size flat maps for levels.

class OrderBook {
public:
  // Max depth levels to track
  static constexpr size_t MAX_DEPTH = 10;

  struct Level {
    core::Price price;
    core::Quantity qty;
  };

  void apply_update(const LevelUpdate &update) {
    auto &side_map = (update.side == core::Side::Buy) ? bids_ : asks_;

    if (update.qty.amount == 0) {
      // Delete
      side_map.erase(update.price);
    } else {
      // Insert/Update
      side_map[update.price] = update.qty;
    }

    last_update_ts_ = update.header.local_ts;
  }

  // Get Top Of Book
  bool get_bbo(core::Price &bid, core::Price &ask) const {
    if (bids_.empty() || asks_.empty())
      return false;

    bid = bids_.rbegin()->first; // Highest Bid
    ask = asks_.begin()->first;  // Lowest Ask
    return true;
  }

  // Get snapshot of top N levels
  // Fills provided vectors, returns number of levels filled
  size_t get_snapshot(std::vector<Level> &bid_levels,
                      std::vector<Level> &ask_levels,
                      size_t n = MAX_DEPTH) const {
    bid_levels.clear();
    ask_levels.clear();

    size_t count = 0;
    for (auto it = bids_.rbegin(); it != bids_.rend() && count < n; ++it) {
      bid_levels.push_back({it->first, it->second});
      count++;
    }

    count = 0;
    for (auto it = asks_.begin(); it != asks_.end() && count < n; ++it) {
      ask_levels.push_back({it->first, it->second});
      count++;
    }
    return count;
  }

private:
  // Std::map is RB-Tree (Node based). Not cache friendly but good for sparse
  // books. For HFT, flat_map or fixed arrays are better. Using map for O(log N)
  // updates which is acceptable for < 100 levels.
  std::map<core::Price, core::Quantity> bids_;
  std::map<core::Price, core::Quantity> asks_;

  core::Timestamp last_update_ts_ = 0;
};

} // namespace hft::data
