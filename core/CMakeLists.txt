add_library(core INTERFACE)
target_include_directories(core INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})

# headers are just listed in add_library for IDE visibility in some generators, 
# but for INTERFACE libraries we don't strictly pass sources to add_library in older CMake.
# In CMake 3.20+ (which we use), we can attach sources to INTERFACE targets via target_sources if needed,
# or just rely on include dirs. 
# We'll stick to simple INTERFACE definition.

