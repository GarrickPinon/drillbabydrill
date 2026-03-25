#pragma once

#include "../core/logger.hpp" // For audit trails (log after decision)
#include "../core/types.hpp"
#include "order_gateway_interface.hpp"


#include <array>

namespace hft::execution {

struct RiskConfig {
  core::Quantity max_order_qty;
  core::Price max_price_deviation; // vs Reference price
  int64_t max_orders_per_sec;
};

class RiskCheck {
public:
  RiskCheck(const RiskConfig &config) : config_(config) {}

  // Returns true if passed, false if rejected
  // [[nodiscard]] to ensure we check the result
  [[nodiscard]] bool check_new_order(const OrderCommand &cmd,
                                     core::Price ref_price) {

    // Check 1: Max Qty
    if (cmd.qty.amount > config_.max_order_qty.amount) [[unlikely]] {
      return false;
    }

    // Check 2: Fat Finger / Price Deviation
    // Abs diff
    int64_t diff = cmd.price.ticks - ref_price.ticks;
    if (diff < 0)
      diff = -diff;

    if (diff > config_.max_price_deviation.ticks) [[unlikely]] {
      return false;
    }

    // Check 3: Rate Limit (Simple token bucket or counter)
    // ... (Omitting for brevity, but would be here)

    return true;
  }

private:
  RiskConfig config_;
};

} // namespace hft::execution
