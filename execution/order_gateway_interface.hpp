#pragma once

#include "../core/time.hpp"
#include "../core/types.hpp"


namespace hft::execution {

struct OrderCommand {
  core::SymbolId symbol_id;
  core::OrderId order_id; // Client Order ID
  core::Price price;
  core::Quantity qty;
  core::Side side;
  // TimeInForce, OrderType, etc.
};

enum class CommandType : uint8_t {
  NewOrder = 0,
  CancelOrder = 1,
  ModifyOrder = 2
};

struct GatewayMessage {
  CommandType type;
  OrderCommand command;
  core::Timestamp timestamp;
};

// Abstract interface for Order Entry
class OrderGatewayInterface {
public:
  virtual ~OrderGatewayInterface() = default;

  // Hot path method - must be non-blocking
  virtual void send_order(const OrderCommand &cmd) = 0;
  virtual void cancel_order(core::OrderId oid, core::SymbolId sid) = 0;
};

} // namespace hft::execution
