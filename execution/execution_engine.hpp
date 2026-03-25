#pragma once

#include "../core/logger.hpp"
#include "../core/ring_buffer.hpp"
#include "../data/market_data_types.hpp"
#include "order_gateway_interface.hpp"
#include "risk_check.hpp"

namespace hft::execution {

// The main engine that ties Strategy -> Risk -> Gateway
template <typename StrategyType, typename GatewayType> class ExecutionEngine {
public:
  ExecutionEngine(StrategyType &strategy, GatewayType &gateway,
                  const RiskConfig &risk_cfg)
      : strategy_(strategy), gateway_(gateway), risk_(risk_cfg) {}

  // This is the main callback from the Market Data thread
  // Or it pulls from a RingBuffer itself.
  // For lowest latency, we often have the strategy logic INLINE here.

  void on_trade(const data::TradeUpdate &trade) {
    // Update Strategy
    auto signal = strategy_.on_trade(trade);

    if (signal.should_trade) { // Branch prediction
      execute_signal(signal);
    }
  }

  // Inline to avoid function call overhead
#ifdef _MSC_VER
  __forceinline void execute_signal(const auto &signal) {
#else
  __attribute__((always_inline)) void execute_signal(const auto &signal) {
#endif
    OrderCommand cmd;
    cmd.symbol_id = signal.symbol_id;
    cmd.price = signal.price;
    cmd.qty = signal.qty;
    cmd.side = signal.side;
    cmd.order_id = next_order_id_++;

    // 1. Pre-Trade Risk
    if (risk_.check_new_order(cmd, signal.ref_price)) [[likely]] {
      // 2. Gateway Send
      gateway_.send_order(cmd);

      // 3. Post (Log, State Update) - OFF HOT PATH ideally
      // But we log to ring buffer which is fast
      core::Logger::instance().logf(
          core::LogLevel::INFO, "ORDER_SENT id=%llu sym=%u px=%f qty=%f",
          static_cast<unsigned long long>(cmd.order_id), cmd.symbol_id,
          cmd.price.to_float(), cmd.qty.to_float());
    } else {
      core::Logger::instance().logf(
          core::LogLevel::WARN, "RISK_REJECT id=%llu sym=%u",
          static_cast<unsigned long long>(cmd.order_id), cmd.symbol_id);
    }
  }

private:
  StrategyType &strategy_;
  GatewayType &gateway_;
  RiskCheck risk_;

  uint64_t next_order_id_ = 1;
};

} // namespace hft::execution
