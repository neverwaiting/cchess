add_subdirectory(http)
add_library(wsun_websocket WebsocketContext.cc WebsocketServer.cc WebsocketClient.cc)

add_executable(test_bit test/test_bit.cc)

add_executable(test_websocket_context test/test_context.cc)
target_link_libraries(test_websocket_context wsun_websocket wsun_http muduo_net muduo_base)

add_executable(test_websocket_client test/test_client.cc)
target_link_libraries(test_websocket_client wsun_websocket wsun_http muduo_net muduo_base)

add_executable(test_websocket_server test/test_server.cc)
target_link_libraries(test_websocket_server wsun_websocket wsun_http muduo_net muduo_base)
