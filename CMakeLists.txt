cmake_minimum_required(VERSION 3.0)

project(cchess)

SET(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11 -pthread -O2")

add_subdirectory(websocket)

add_custom_command(OUTPUT cchess.pb.h cchess.pb.cc
	COMMAND protoc
	ARGS --cpp_out . ${CMAKE_CURRENT_SOURCE_DIR}/cchess.proto -I${CMAKE_CURRENT_SOURCE_DIR}
	DEPENDS cchess.proto)

include_directories(${PROJECT_BINARY_DIR})

add_executable(center_server center_server.cc cchess.pb.cc server_codec/codec.cc)
target_link_libraries(center_server muduo_base muduo_net protobuf z)

add_executable(login_server login_server.cc cchess.pb.cc server_codec/codec.cc)
target_link_libraries(login_server muduo_base muduo_net protobuf z)

add_executable(match_server match_server.cc cchess.pb.cc server_codec/codec.cc)
target_link_libraries(match_server muduo_base muduo_net protobuf z)

add_executable(ws_connections_server ws_connections_server.cc cchess.pb.cc server_codec/codec.cc)
target_link_libraries(ws_connections_server wsun_websocket wsun_http muduo_net muduo_base protobuf z)

add_subdirectory(cchess_engine)

add_executable(cchess_bench cchess_bench.cc cchess.pb.cc client_codec/codec.cc)
target_link_libraries(cchess_bench wsun_websocket wsun_http muduo_net muduo_base protobuf z cchess_cc)
