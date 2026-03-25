#pragma once

#include <cstdint>

#ifdef _MSC_VER
#include <intrin.h>
#include <windows.h>
#else
#include <ctime>
#include <x86intrin.h>
#endif

namespace hft {
namespace core {

// -------------------------------------------------------------------------
// Timestamp (Nanos since epoch)
// -------------------------------------------------------------------------
using Timestamp = int64_t;

inline Timestamp now_nanos() {
#ifdef _MSC_VER
  static LARGE_INTEGER frequency = []() {
    LARGE_INTEGER freq;
    QueryPerformanceFrequency(&freq);
    return freq;
  }();
  LARGE_INTEGER counter;
  QueryPerformanceCounter(&counter);
  return static_cast<Timestamp>(counter.QuadPart * 1'000'000'000 /
                                frequency.QuadPart);
#else
  struct timespec ts;
  clock_gettime(CLOCK_REALTIME, &ts);
  return ts.tv_sec * 1'000'000'000 + ts.tv_nsec;
#endif
}

// -------------------------------------------------------------------------
// RDTSC (CPU Cycles) - For micro-benchmarking
// -------------------------------------------------------------------------
inline uint64_t rdtsc() { return __rdtsc(); }

// Barrier for strict ordering of RDTSC
inline uint64_t rdtscp() {
  unsigned int aux;
  return __rdtscp(&aux);
}

} // namespace core
} // namespace hft
