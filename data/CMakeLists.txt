add_library(data INTERFACE)
target_link_libraries(data INTERFACE core)
target_include_directories(data INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
