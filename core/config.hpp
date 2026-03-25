#pragma once

#include "types.hpp"
#include <string>
#include <vector>


namespace hft::core {

struct Config {
  // Just a placeholder struct
  // In prod, use yaml-cpp or similar
  std::string exchange_name;
};

inline Config load_config(const std::string &path) { return Config{"TXSE"}; }

} // namespace hft::core
