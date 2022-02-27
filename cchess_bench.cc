#include "muduo/base/Logging.h"
#include "muduo/net/EventLoop.h"
#include "muduo/net/EventLoopThreadPool.h"
#include "muduo/base/ThreadPool.h"

#include "websocket/WebsocketClient.h"
#include "client_codec/codec.h"
#include "client_codec/dispatcher.h"
#include "cchess.pb.h"
#include <mutex>
#include <atomic>
#include <algorithm>
#include <random>
#include <tuple>

#include "cchess_engine/board.h"
#include "cchess_engine/search_engine.h"

using namespace muduo;
using namespace muduo::net;
using namespace muduo::net::websocket;

typedef std::shared_ptr<wsun::LoginSuccessResponse> LoginSuccessResponsePtr;
typedef std::shared_ptr<wsun::LoginFailedResponse> LoginFailedResponsePtr;
typedef std::shared_ptr<wsun::MatchResponse> MatchResponsePtr;
typedef std::shared_ptr<wsun::MoveStep> MoveStepPtr;
typedef std::shared_ptr<wsun::ForgiveRequest> ForgiveRequestPtr;
typedef std::shared_ptr<wsun::ForgiveResponse> ForgiveResponsePtr;
typedef std::shared_ptr<wsun::DrawRequest> DrawRequestPtr;
typedef std::shared_ptr<wsun::DrawResponse> DrawResponsePtr;
typedef std::shared_ptr<wsun::OppReconnected> OppReconnectedPtr;
typedef std::shared_ptr<wsun::OppDisconnected> OppDisconnectedPtr;
typedef std::shared_ptr<wsun::GameOver> GameOverPtr;
typedef std::shared_ptr<wsun::GameSituation> GameSituationPtr;

using ::wsun::cchess::Board;
using ::wsun::cchess::SearchEngine;

class Engine
{
public:
	Engine() : board_(new Board), innerEngine_(new SearchEngine(board_.get()))
	{
	}

	std::tuple<bool,int,std::string> play(const std::string& fen = ::wsun::cchess::INIT_FEN_STRING)
	{
		board_->resetFromFen(fen.c_str());
		int mv = innerEngine_->search(kSearchTime);
		board_->play(mv);
		std::string fenString = board_->toFen();
		bool over = board_->noWayToMove();
		return std::make_tuple(over, mv, fenString);
	}

private:
	std::unique_ptr<Board> board_;
	std::unique_ptr<SearchEngine> innerEngine_;

	static const int kSearchTime;
};
const int Engine::kSearchTime = 1;

// 分配一个线程局部对象, 便于线程池中做engine search 任务
__thread Engine* gEngine;

int getRandomNumber(int min, int max)
{
	static std::default_random_engine generator;
	std::uniform_int_distribution<int> distribution(min, max);
	return distribution(generator);
}

struct RobotData
{
	RobotData()
	{
		reset();
		quicklyPatternTimes = getRandomNumber(10, 20);
		slowlyPatternTimes = getRandomNumber(2, 10);
	}

	void reset()
	{
		waitTimeToLogin = getRandomNumber(3, 5);
		waitTimeToMatch = getRandomNumber(2, 10);
		intervalToMove = getRandomNumber(1, 10);
		stepsForDisconnect = getRandomNumber(10, 15);
		stepsForGiveup = getRandomNumber(20, 40);
		intervalToMatchAgain = getRandomNumber(2, 5);
	}

	//建立连接后多少秒发登录请求
	int waitTimeToLogin;
	//登录成功之后多少秒发匹配请求
	int waitTimeToMatch;
	//匹配成功后，每隔多少秒走一步
	int intervalToMove;
	//走多少步断线，断线之后自动重新连接
	int stepsForDisconnect;
	//每场下多少步棋直接认输
	int stepsForGiveup;
	//每结束一场，间隔多少秒开始匹配
	int intervalToMatchAgain;

	//玩多少场十分钟的，多少场二十分钟的
	int quicklyPatternTimes;
	int slowlyPatternTimes;
};

class UserStorage
{
public:
	typedef std::array<int,60000> Array;
	UserStorage()
	{
		nameIdArray_.fill(1);
		curIdx_ = nameIdArray_.begin();
	}

	std::string getVaildUsername()
	{
		std::ostringstream oss;
		
		int idx = -1;
		{
			std::lock_guard<std::mutex> lock(mut_);
			while (*curIdx_ == 0)
			{
				advanceIterator();
			}
			idx = std::distance(nameIdArray_.begin(), curIdx_);
			*curIdx_ = 0;
			advanceIterator();
		}
		oss << "wintersun" << idx;
		return oss.str();
	}

	void recycleUsername(const std::string& name)
	{
		int idx = atoi(name.substr(9).c_str());
		Array::iterator it;
		std::advance(it, idx);
		*it = 1;
	}

private:
	void advanceIterator()
	{
		if (++curIdx_ == nameIdArray_.end())
		{
			curIdx_ = nameIdArray_.begin();
		}
	}

	std::mutex mut_;
	Array nameIdArray_;
	Array::iterator curIdx_;
};

UserStorage gUserStorage;

class Client : noncopyable
{
public:
	enum State
	{
		kConnected,
		kOnline,
		kMatching,
		kPlaying,
		kDisconnectedInPlaying,
		kDisconnected
	};

	Client(EventLoop* loop, const InetAddress& addr, ThreadPool* taskPool)
		: loop_(loop),
			client_(loop, addr, "CChessClient"),
			dispatcher_(std::bind(&Client::onUnknownMessage, this, _1, _2)),
			codec_(std::bind(&ProtobufDispatcher::onProtobufMessage, &dispatcher_, _1, _2)),
			data_(new RobotData),
			playedTimes_(0),
			state_(kDisconnected),
			pool_(taskPool),
			inTaskQueue_(false)
	{
    client_.setConnectionCallback(
        std::bind(&Client::onConnection, this, _1));
    client_.setBinaryMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));

		dispatcher_.registerMessageCallback<wsun::LoginSuccessResponse>(
				std::bind(&Client::onLoginSuccessResponse, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::LoginFailedResponse>(
				std::bind(&Client::onLoginFailedResponse, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::MatchResponse>(
				std::bind(&Client::onMatchResponse, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::MoveStep>(
				std::bind(&Client::onMoveStep, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::OppDisconnected>(
				std::bind(&Client::onOppDisconnected, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::OppReconnected>(
				std::bind(&Client::onOppReconnected, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::GameSituation>(
				std::bind(&Client::onGameSituation, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::GameOver>(
				std::bind(&Client::onGameOver, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::ForgiveRequest>(
				std::bind(&Client::onForgiveRequest, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::ForgiveResponse>(
				std::bind(&Client::onForgiveResponse, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::DrawRequest>(
				std::bind(&Client::onDrawRequest, this, _1, _2));
		dispatcher_.registerMessageCallback<wsun::DrawResponse>(
				std::bind(&Client::onDrawResponse, this, _1, _2));
	}

	int getPlayTimes() const
	{
		return data_->quicklyPatternTimes + data_->slowlyPatternTimes;
	}

	int getPlayedTimes() const
	{
		return playedTimes_;
	}

	State getState() const
	{
		return state_;
	}

  void connect()
  {
		client_.connect();
  }

private:
  void onUnknownMessage(const WebsocketConnectionPtr& conn,
                        const MessagePtr& message)
  {
    LOG_INFO << "onUnknownMessage: " << message->GetTypeName();
    conn->forceClose();
  }

	void onConnection(const WebsocketConnectionPtr& conn)
	{
		if (conn->connected())
		{
			conn_ = conn;
			if (state_ == kDisconnected)
				state_ = kConnected;
			if (getPlayTimes() > 0)
				loginTimer_ = loop_->runAfter(data_->waitTimeToLogin, std::bind(&Client::toLogin, this));
		}
		else
		{
			loop_->cancel(loginTimer_);
			loop_->cancel(matchTimer_);
			conn_.reset();
			if (state_ == kPlaying)
			{
				state_ = kDisconnectedInPlaying;
			}
			else
			{
				state_ = kDisconnected;
			}
			client_.connect();
		}
	}

	void toLogin()
	{
		assert(state_ == kConnected || state_ == kDisconnectedInPlaying);
		if (username_.empty())
			username_ = gUserStorage.getVaildUsername();
		::wsun::LoginRequest req;
		req.set_username(username_);
		req.set_passwd(kPasswd);
		if (conn_)
			codec_.send(conn_, req);
	}
	
	::wsun::RoomType getRoomType()
	{
		using ::wsun::RoomType::QUICKLY_PATTERN;
		using ::wsun::RoomType::SLOWLY_PATTERN;
		return (playedTimes_ % 2 == 0 ? 
				(data_->quicklyPatternTimes == 0 ? SLOWLY_PATTERN : QUICKLY_PATTERN) :
				(data_->slowlyPatternTimes == 0 ? QUICKLY_PATTERN : SLOWLY_PATTERN));
	}
	void toMatch()
	{
		assert(state_ == kOnline);
		state_ = kMatching;
		::wsun::MatchRequest req;
		req.set_type(getRoomType());
		if (conn_)
			codec_.send(conn_, req);
	}
	void sendMoveStep(const MoveStepPtr& req)
	{
		inTaskQueue_ = false;
		if (state_ != kPlaying) return ;
		if (conn_)
		{
			--data_->stepsForDisconnect;
			--data_->stepsForGiveup;
			codec_.send(conn_, *req);
		}
	}
	void doMoveTaskRoutine(const std::string& fen)
	{
		std::tuple<bool,int,std::string> res;
		if (fen.empty())
			res = gEngine->play();
		else
			res = gEngine->play(fen);

		MoveStepPtr req(new ::wsun::MoveStep);
		req->set_over(std::get<0>(res));
		req->set_mv(std::get<1>(res));
		req->set_fen(std::get<2>(res));

		loop_->runInLoop(std::bind(&Client::sendMoveStep, this, req));
	}
	void toPlay(const std::string& fen)
	{
		if (data_->stepsForGiveup == 0)
		{
			toGiveup();
		}
		else
		{
			pool_->run(std::bind(&Client::doMoveTaskRoutine, this, fen));
			inTaskQueue_ = true;
		}
	}
	void toGiveup()
	{
		::wsun::Giveup req;
		codec_.send(conn_, req);
	}

	void onLoginSuccessResponse(const WebsocketConnectionPtr& conn, const LoginSuccessResponsePtr& msg)
	{
		state_ = kOnline;
		matchTimer_ = loop_->runAfter(data_->waitTimeToMatch, std::bind(&Client::toMatch, this));
	}
	void onLoginFailedResponse(const WebsocketConnectionPtr& conn, const LoginFailedResponsePtr& msg)
	{
		loginTimer_ = loop_->runAfter(data_->waitTimeToLogin, std::bind(&Client::toLogin, this));
	}
	void onMatchResponse(const WebsocketConnectionPtr& conn, const MatchResponsePtr& msg)
	{
		state_ = kPlaying;
		if (msg->selftype() == ::wsun::MatchResponse::RED)
			toPlay("");
	}
	void onMoveStep(const WebsocketConnectionPtr& conn, const MoveStepPtr& msg)
	{
		if (state_ != kPlaying || msg->over()) return ;

		if (inTaskQueue_)
		{
			LOG_INFO << "state in onMoveStep: " << state_;
			return ;
		}
		//assert(!inTaskQueue_);
		toPlay(msg->fen());
	}
	void onOppDisconnected(const WebsocketConnectionPtr& conn, const OppDisconnectedPtr&)
	{
		// do nothing
	}
	void onOppReconnected(const WebsocketConnectionPtr& conn, const OppReconnectedPtr&)
	{
		// do nothing
	}
	void onGameSituation(const WebsocketConnectionPtr& conn, const GameSituationPtr& msg)
	{
		if (state_ != kDisconnectedInPlaying)
		{
			LOG_INFO << "state in onGameSituation: " << state_;
		}
		//assert(state_ == kDisconnectedInPlaying);
		state_ = kPlaying;
		if (msg->turntome() && !inTaskQueue_)
		{
			toPlay(msg->fen());
		}
	}
	void onGameOver(const WebsocketConnectionPtr& conn, const GameOverPtr&)
	{
		int* curPlayPatternTimes = (playedTimes_ % 2 == 0 ? 
				(data_->quicklyPatternTimes == 0 ? 
						&data_->slowlyPatternTimes : &data_->quicklyPatternTimes) :
				(data_->slowlyPatternTimes == 0 ? 
						&data_->quicklyPatternTimes : &data_->slowlyPatternTimes));
		*curPlayPatternTimes = *curPlayPatternTimes - 1;
		++playedTimes_;

		state_ = kOnline;
		if (getPlayTimes() > 0)
		{
			data_->reset();
			matchTimer_ = loop_->runAfter(data_->intervalToMatchAgain, std::bind(&Client::toMatch, this));
		}
		else
		{
			gUserStorage.recycleUsername(username_);
			username_.clear();
		}
	}
	void onForgiveRequest(const WebsocketConnectionPtr& conn, const ForgiveRequestPtr&)
	{
		// do nothing
	}
	void onForgiveResponse(const WebsocketConnectionPtr& conn, const ForgiveResponsePtr&)
	{
		// do nothing
	}
	void onDrawRequest(const WebsocketConnectionPtr& conn, const DrawRequestPtr&)
	{
		// do nothing
	}
	void onDrawResponse(const WebsocketConnectionPtr& conn, const DrawResponsePtr&)
	{
		// do nothing
	}

private:
	EventLoop* loop_;
	WebsocketClient client_;
	ProtobufDispatcher dispatcher_;
	ProtobufCodec codec_;
	std::unique_ptr<RobotData> data_;
	int playedTimes_;
	State state_;
	WebsocketConnectionPtr conn_;
	std::string username_;
	ThreadPool* pool_;

	bool inTaskQueue_;

	TimerId loginTimer_;
	TimerId matchTimer_;

	static const std::string kPasswd;
};
const std::string Client::kPasswd = "123456";

class BenchMark
{
public:
	BenchMark(EventLoop* loop, const InetAddress& serverAddr, int nclients)
		: loop_(loop),
			loopPool_(loop, "BenchMarkPool"),
			taskPool_("SearchEngineTaskPool"),
			clients_(nclients),
			totalPlayTimes_(0)
	{
		loopPool_.setThreadNum(kThreadNum);
		taskPool_.setThreadInitCallback([]
				{
					gEngine = new Engine;
				});

		for (int i = 0; i < nclients; ++i)
		{
			clients_[i].reset(new Client(loopPool_.getNextLoop(), serverAddr, &taskPool_));
			totalPlayTimes_ += clients_[i]->getPlayTimes();
		}
	}

	void start()
	{
		loop_->runEvery(3.0, std::bind(&BenchMark::printer, this));
		taskPool_.start(kTaskThreadNum);
		loopPool_.start();
		std::for_each(clients_.begin(), clients_.end(), 
				[](const std::unique_ptr<Client>& client)
				{
					client->connect();
					usleep(10);
				});
	}

private:
	void printer()
	{
		int playedTimes = 0;
		int disconnected = 0;
		int connected = 0;
		int online = 0;
		int matching = 0;
		int playing = 0;
		int disconnectedInPlaying = 0;

		std::for_each(clients_.begin(), clients_.end(), 
				[&](const std::unique_ptr<Client>& client)
				{
					playedTimes += client->getPlayedTimes();
					Client::State state = client->getState();
					if (state == Client::kDisconnected)
						++disconnected;
					else if (state == Client::kConnected)
						++connected;
					else if (state == Client::kOnline)
						++online;
					else if (state == Client::kMatching)
						++matching;
					else if (state == Client::kPlaying)
						++playing;
					else if (state == Client::kDisconnectedInPlaying)
						++disconnectedInPlaying;
				});
		LOG_INFO << "playedTimes: (" << playedTimes << " / " << totalPlayTimes_ 
						 << "), Disconnected: " << disconnected
						 << ", DisconnectedInPlaying: " << disconnectedInPlaying
						 << ", Connected: " << connected
						 << ", Online: " << online << ", Matching: " << matching
						 << ", Playing: " << playing;
	}

private:
	EventLoop* loop_;
	EventLoopThreadPool loopPool_;
	ThreadPool taskPool_;
	std::vector<std::unique_ptr<Client>> clients_;
	int totalPlayTimes_;

	static const int kThreadNum;
	static const int kTaskThreadNum;
};
const int BenchMark::kThreadNum = 4;
const int BenchMark::kTaskThreadNum = 2;

int main(int argc, char** argv)
{
	int clientNum = atoi(argv[1]);
	const InetAddress serverAddr("192.168.235.10", 8888);
	EventLoop loop;
	BenchMark bench(&loop, serverAddr, clientNum);
	bench.start();
	loop.loop();
}
