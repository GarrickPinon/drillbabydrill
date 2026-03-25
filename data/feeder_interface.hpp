#pragma once

#include "market_data_types.hpp"
#include <functional>

namespace hft::data {

// Interface for data ingestion (Exchange -> System)
class FeederInterface {
public:
  using TradeCallback = std::function<void(const TradeUpdate &)>;
  using LevelCallback = std::function<void(const LevelUpdate &)>;

  virtual ~FeederInterface() = default;

  virtual void key_start() = 0;
  virtual void stop() = 0;

  void set_on_trade(TradeCallback cb) { on_trade_ = cb; }
  // void set_on_quote(LevelCallback cb) { on_quote_ = cb; }

protected:
  TradeCallback on_trade_;
  // LevelCallback on_quote_;
};

} // namespace hft::data
