#pragma once

#include "../core/time.hpp"
#include "../core/types.hpp"


namespace hft::data {

enum class UpdateType : uint8_t {
  Trade = 0,
  BBO = 1,     // Best Bid/Offer update (L1)
  Update = 2,  // Depth update (L2)
  Snapshot = 3 // Full book snapshot
};

struct MDHeader {
  core::Timestamp exchange_ts; // Exchange timestamp
  core::Timestamp local_ts;    // Local receipt timestamp
  core::SymbolId symbol_id;
  UpdateType type;
};

struct TradeUpdate {
  MDHeader header;
  core::Price price;
  core::Quantity qty;
  core::Side side; // Aggressor side
};

struct LevelUpdate {
  MDHeader header;
  core::Price price;
  core::Quantity qty;
  core::Side side;
  // bool is_delete? Implicit if qty=0
};

// For internal normalized stream
struct NormalizedOneWay {
  MDHeader header;
  core::Price price;
  core::Quantity qty;
  core::Side side;
};

} // namespace hft::data
