#include "muduo/base/Logging.h"
#include "muduo/net/EventLoop.h"
#include "muduo/net/InetAddress.h"
#include "muduo/net/TcpClient.h"
#include "muduo/net/TcpServer.h"
#include "websocket/WebsocketServer.h"

#include "server_codec/codec.h"
#include "cchess.pb.h"

#include <queue>
#include <utility>

#include <stdio.h>
#include <unistd.h>

using namespace muduo;
using namespace muduo::net;
using namespace muduo::net::websocket;

const int kMaxConns = 60000;  // 65535
const size_t kIdLen = 2;
const size_t kHeadLen = 4;

const uint16_t kClientPort = 8888;
const uint16_t kBackendPort = 2022;

typedef std::shared_ptr<wsun::Disconnected> DisconnectedPtr;

class WsConnectionServer : noncopyable
{
 public:
  WsConnectionServer(EventLoop* loop, const InetAddress& listenAddr, const InetAddress& backendAddr)
    : server_(loop, listenAddr, "WsConnectionServer"),
      backend_(loop, backendAddr, "MultiplexBackend"),
			bytesRecieveFromClients_(0), bytesRecieveFromBackend_(0),
			messageRecieveFromClients_(0), messageRecieveFromBackend_(0)
  {
		// 用一个线程专门来负责处理连接, 所有连接读写事件则放在另一线程中
		server_.setThreadNums(1);
    server_.setConnectionCallback(
        std::bind(&WsConnectionServer::onClientConnection, this, _1));
    server_.setBinaryMessageCallback(
        std::bind(&WsConnectionServer::onClientMessage, this, _1, _2, _3));
		server_.setWaitSendConnReqTime(20);
		server_.setPingInterval(10);
		server_.setWaitPongTime(5);

    backend_.setConnectionCallback(
        std::bind(&WsConnectionServer::onBackendConnection, this, _1));
    backend_.setMessageCallback(
        std::bind(&WsConnectionServer::onBackendMessage, this, _1, _2, _3));
    backend_.enableRetry();
  }

  void start()
  {
		backend_.getLoop()->runEvery(kInterval, std::bind(&WsConnectionServer::statistics, this));
    backend_.connect();
    server_.start();
  }

 private:
	void statistics()
	{
		int avgBytesClient = bytesRecieveFromClients_ / kInterval;
		int avgBytesBackend = bytesRecieveFromClients_ / kInterval;
		int avgMessagesClient = messageRecieveFromClients_ / kInterval;
		int avgMessagesBackend = messageRecieveFromBackend_ / kInterval;

		bytesRecieveFromBackend_ = bytesRecieveFromClients_ = messageRecieveFromBackend_ = messageRecieveFromClients_ = 0;

		LOG_INFO << "recieve from clients: " << avgBytesClient << " bps, " << avgMessagesClient << " qps";
		LOG_INFO << "recieve from backend: " << avgBytesBackend << " bps, " << avgMessagesBackend << " qps";
	}

  void onClientConnection(const WebsocketConnectionPtr& conn)
  {
    if (conn->connected())
    {
      int id = -1;
      if (!availIds_.empty())
      {
        id = availIds_.front();
        availIds_.pop();
        clientConns_[id] = conn;
      }

      if (id <= 0)
      {
        // no client id available
				conn->forceClose();
      }
      else
      {
        conn->setContext(id);
      }
    }
    else
    {
      if (!conn->getContext().empty())
      {
        int id = boost::any_cast<int>(conn->getContext());
        assert(id > 0 && id <= kMaxConns);

        if (backendConn_)
        {
          // put client id back for reusing
          availIds_.push(id);
          clientConns_.erase(id);
					// send disconnect message to backend
					sendBackendMessage(id, wsun::Disconnected());
        }
        else
        {
          assert(availIds_.empty());
          assert(clientConns_.empty());
        }
      }
    }
  }

  void sendBackendMessage(int id, const google::protobuf::Message& message)
  {
    muduo::net::Buffer buf;
		ProtobufCodec::fillEmptyBuffer(&buf, message);
		buf.prependInt16(static_cast<int16_t>(id));
    backendConn_->send(&buf);
  }

	void debugInfoMessage(const char* buf, size_t len)
	{
		std::cout << "start recieve raw message" << std::endl;
		for (size_t i = 0; i < len; ++i)
		{
			std::cout << (unsigned)(buf[i]) << " ";
		}
		std::cout << "\nend recieve raw message" << std::endl;
	}

  void onClientMessage(const WebsocketConnectionPtr& conn, const char* data, size_t len)
  {
		bytesRecieveFromClients_ += len;
		++messageRecieveFromClients_;

		//debugInfoMessage(data, len);
    if (!conn->getContext().empty())
    {
      int id = boost::any_cast<int>(conn->getContext());
			Buffer buf;
			buf.append(data, len);
			// 1. 4 bytes length, dataLen is enough
			// 2. add id head to raw buff, id len 2bytes
			buf.prependInt16(id);
			backendConn_->send(&buf);
    }
  }

  void onBackendConnection(const TcpConnectionPtr& conn)
  {
    LOG_INFO << "Backend " << conn->localAddress().toIpPort() << " -> "
              << conn->peerAddress().toIpPort() << " is "
              << (conn->connected() ? "UP" : "DOWN");

    if (conn->connected())
    {
      backendConn_ = conn;
      assert(availIds_.empty());
      for (int i = 1; i <= kMaxConns; ++i)
      {
        availIds_.push(i);
      }
    }
    else
    {
      backendConn_.reset();
      for (std::map<int, WebsocketConnectionPtr>::iterator it = clientConns_.begin();
          it != clientConns_.end();
          ++it)
      {
        it->second->forceClose();
      }
      clientConns_.clear();
      while (!availIds_.empty())
      {
        availIds_.pop();
      }
    }
  }

  void onBackendMessage(const TcpConnectionPtr& conn, Buffer* buf, Timestamp)
  {
		bytesRecieveFromBackend_ += buf->readableBytes();
		//LOG_INFO << "backend to clients: length=" << buf->readableBytes();
    sendToClient(buf);
  }

  void sendToClient(Buffer* buf)
  {
    while (buf->readableBytes() > kIdLen + kHeadLen)
    {
      int id = buf->peekInt16();
			int dataLen = ntohl(*((int*)(buf->peek() + 2)));
      if (buf->readableBytes() < kIdLen + kHeadLen + dataLen)
      {
        break;
      }

			if (id >= 0)
			{
				std::map<int, WebsocketConnectionPtr>::iterator it = clientConns_.find(id);
				if (it != clientConns_.end())
				{
					++messageRecieveFromBackend_;
					//debugInfoMessage(buf->peek() + kIdLen, dataLen + kHeadLen);
					it->second->sendBinary(buf->peek() + kIdLen, dataLen + kHeadLen);
				}
			}
			buf->retrieve(kIdLen + kHeadLen + dataLen);
		}
  }

	WebsocketServer server_;
  TcpClient backend_;
  TcpConnectionPtr backendConn_;
  std::map<int, WebsocketConnectionPtr> clientConns_;
  std::queue<int> availIds_;

	// for monitor
	int bytesRecieveFromClients_;
	int bytesRecieveFromBackend_;
	int messageRecieveFromClients_;
	int messageRecieveFromBackend_;

	const int kInterval = 3;
};

int main(int argc, char* argv[])
{
  LOG_INFO << "pid = " << getpid();
  EventLoop loop;
  InetAddress listenAddr(kClientPort);
  InetAddress backendAddr(kBackendPort);
  WsConnectionServer server(&loop, listenAddr, backendAddr);

  server.start();

  loop.loop();
}
