#include "muduo/base/Logging.h"
#include "muduo/net/EventLoop.h"
#include "muduo/net/InetAddress.h"
#include "muduo/net/TcpClient.h"
#include "muduo/net/TcpServer.h"

#include "server_codec/codec.h"
#include "server_codec/dispatcher.h"
#include "cchess.pb.h"

using namespace muduo;
using namespace muduo::net;

typedef std::shared_ptr<wsun::LoginRequest> LoginRequestPtr;
typedef std::shared_ptr<wsun::LoginSuccessResponse> LoginSuccessResponsePtr;
typedef std::shared_ptr<wsun::LoginFailedResponse> LoginFailedResponsePtr;
typedef std::shared_ptr<wsun::MatchRequest> MatchRequestPtr;
typedef std::shared_ptr<wsun::MatchBackendResponse> MatchBackendResponsePtr;
typedef std::shared_ptr<wsun::MoveStep> MoveStepPtr;
typedef std::shared_ptr<wsun::Giveup> GiveupPtr;
typedef std::shared_ptr<wsun::ForgiveRequest> ForgiveRequestPtr;
typedef std::shared_ptr<wsun::ForgiveResponse> ForgiveResponsePtr;
typedef std::shared_ptr<wsun::DrawRequest> DrawRequestPtr;
typedef std::shared_ptr<wsun::DrawResponse> DrawResponsePtr;
typedef std::shared_ptr<wsun::Disconnected> DisconnectedPtr;

typedef std::shared_ptr<wsun::GameOver> GameOverPtr;
typedef std::shared_ptr<wsun::GameSituation> GameSituationPtr;
typedef std::shared_ptr<wsun::CancelMatchRequest> CancelMatchRequestPtr;

using ::wsun::UserInfo;
using ::wsun::RoomType;

namespace muduo
{
	const std::_Placeholder<4> _4 = std::placeholders::_4;
}

typedef int TimeSeconds;
// game time 20 * 60 
// step time 3 * 60 
// after spend time step time 60
//
// game time 10 * 60 
// step time 60 
// after spend time step time 30
struct RoomInfo
{
	RoomInfo(RoomType type) : roomType(type), lastMoveStep(-1), totalSteps(0)
	{
		if(type == RoomType::QUICKLY_PATTERN)
		{
			gameTime = 10 * 60;
			stepTime = 60;
			endStepTime = 30;
		}
		else
		{
			gameTime = 20 * 60;
			stepTime = 3 * 60;
			endStepTime = 60;
		}
		realStepTime = stepTime;
	}
	void updateFenAndMove(const std::string& newFen, int mv)
	{
		fen = newFen;
		lastMoveStep = mv;
	}
	void updatePerStep(const std::string& newFen, int mv)
	{
		updateFenAndMove(newFen, mv);
		++totalSteps;
	}
	void updateBackStep(const std::string& newFen, int mv)
	{
		updateFenAndMove(newFen, mv);
		--totalSteps;
	}

	RoomType roomType;
	TimerId timer;
	std::string fen;
	int lastMoveStep;
	int totalSteps;
	TimeSeconds gameTime;
	TimeSeconds stepTime;
	TimeSeconds endStepTime;
	TimeSeconds realStepTime;
};
typedef std::shared_ptr<RoomInfo> RoomInfoPtr;

// reconnected GameSituation message
// -- fen lastMoveStep
// -- red userInfo and black userInfo
// -- gameTime stepTime
// -- self: gameSpendTime, stepSpendTime (if startTime != init, connTime - startTime)
// -- opp: gameSpendTime, stepSpendTime
struct InGameInfo
{
	enum PlayerType { kRed, kBlack };

	InGameInfo(int id, PlayerType pType, const RoomInfoPtr& roomInfo)
		: connId(id), 
			type(pType), 
			gameSpendTime(0),
			oppPlayer(nullptr),
			info(roomInfo)
	{
	}

	int connId;
	PlayerType type;
	TimeSeconds gameSpendTime;
	Timestamp startTime;
	InGameInfo* oppPlayer;
	RoomInfoPtr info;
};
typedef std::shared_ptr<InGameInfo> InGameInfoPtr;

// std::map<int,EntryPtr> entrys_;
// std::map<int,RoomPtr> rooms_;
//struct UserInfo
//{
//	std::string name;
//	std::string score;
//	std::string nwin;
//	std::string nloss;
//	std::string total;
//};

struct Entry
{
	enum State
	{
		kOnline,
		kMatching,
		kPlaying,
		kDisconnected,
		kDisconnecteInPlaying
	};

	Entry(int id, const UserInfo& userInfo)
		: connId_(id), userInfo_(userInfo), state_(kOnline)
	{
	}

	int connId_;
	UserInfo userInfo_;
	State state_;
	InGameInfoPtr gameInfo_;
};

typedef std::shared_ptr<Entry> EntryPtr;

class ServiceManager
{
public:
	void pinterAllEntryInfo()
	{
		int online = 0;
		int matching = 0;
		int playing = 0;
		int disconnected = 0;
		int disconnectedInPlaying = 0;
		for (const auto& item : entrys_)
		{
			if (item.second->state_ == Entry::kOnline)
				++online;
			else if (item.second->state_ == Entry::kMatching)
				++matching;
			else if (item.second->state_ == Entry::kPlaying)
				++playing;
			else if (item.second->state_ == Entry::kDisconnected)
				++disconnected;
			else if (item.second->state_ == Entry::kDisconnecteInPlaying)
				++disconnectedInPlaying;
		}
		LOG_INFO << "online: " << online << ", matching: " << matching 
						 << ", playing: " << playing << ", disconnected: " << disconnected
						 << ", disconnectedInPlaying: " << disconnectedInPlaying;
	}

	EntryPtr findEntryByConnId(int connId)
	{
		EntryPtr entry;
		auto it = entrys_.find(connId);
		if (it != entrys_.end())
		{
			entry = it->second;
		}
		return entry;
	}

	int findEntryIdByUsername(const std::string& username)
	{
		int entryId = -1;
		auto it = userList_.find(username);
		if (it != userList_.end())
		{
			entryId = it->second;
		}
		return entryId;
	}

	EntryPtr findEntryByUsername(const std::string& username)
	{
		int entryId = findEntryIdByUsername(username);
		return findEntryByConnId(entryId);
	}

	EntryPtr findOppEntryByEntry(const EntryPtr& entry)
	{
		int oppConnId = entry->gameInfo_->oppPlayer->connId;
		EntryPtr opp = findEntryByConnId(oppConnId);
		return opp;
	}

	void intoHall(int connId, const UserInfo& userInfo)
	{
		EntryPtr entry = std::make_shared<Entry>(connId, userInfo);
		entrys_.insert(std::pair<int,EntryPtr>(connId, entry));
		userList_.insert(std::pair<std::string,int>(userInfo.username(), connId));
	}
	void intoHall(int connId, const EntryPtr& entry)
	{
		entry->connId_ = connId;
		if(entry->gameInfo_) 
			entry->gameInfo_->connId = connId;

		entrys_.insert(std::pair<int,EntryPtr>(connId, entry));
		userList_.insert(std::pair<std::string,int>(entry->userInfo_.username(), connId));
	}
	void outOfHall(int connId, const std::string& username)
	{
		entrys_.erase(connId);
		userList_.erase(username);
	}

	void createRoom(const EntryPtr& redEntry, const EntryPtr& blackEntry, ::wsun::RoomType type)
	{
		RoomInfoPtr roomInfo = std::make_shared<RoomInfo>(type);
		InGameInfoPtr redInfo = std::make_shared<InGameInfo>(redEntry->connId_, InGameInfo::PlayerType::kRed, roomInfo);
		InGameInfoPtr blackInfo = std::make_shared<InGameInfo>(blackEntry->connId_, InGameInfo::PlayerType::kBlack, roomInfo);
		redInfo->oppPlayer = blackInfo.get();
		blackInfo->oppPlayer = redInfo.get();
		redEntry->gameInfo_ = redInfo;
		blackEntry->gameInfo_ = blackInfo;
		redEntry->state_ = Entry::kPlaying;
		blackEntry->state_ = Entry::kPlaying;
	}

	void destroyRoomInfoOfEntry(const EntryPtr& entry)
	{
		if(entry->state_ == Entry::kDisconnecteInPlaying || entry->state_ == Entry::kDisconnected)
		{
			entry->state_ = Entry::kDisconnected;
			outOfHall(entry->connId_, entry->userInfo_.username());
		}
		else if(isOnPlaying(entry))
		{
			entry->gameInfo_.reset();
			entry->state_ = Entry::kOnline;
		}
	}
	void destroyRoom(const EntryPtr& selfEntry, const EntryPtr& oppEntry)
	{
		destroyRoomInfoOfEntry(selfEntry);
		destroyRoomInfoOfEntry(oppEntry);
	}

	bool isOnPlaying(const EntryPtr& entry) const
	{
		return entry->state_ == Entry::kPlaying;
	}
	bool isInRoom(const EntryPtr& entry) const
	{
		return entry->state_ == Entry::kDisconnecteInPlaying || entry->state_ == Entry::kPlaying;
	}
	void initStartGameTime(const EntryPtr& entry)
	{
		entry->gameInfo_->startTime = Timestamp::now();
	}
	bool isSpendAllGameTime(const EntryPtr& entry) const
	{
		return entry->gameInfo_->info->gameTime <= entry->gameInfo_->gameSpendTime;
	}
	void updateRealStepTime(const EntryPtr& entry)
	{
		if (isSpendAllGameTime(entry))
		{
			entry->gameInfo_->info->realStepTime = entry->gameInfo_->info->endStepTime;
		}
		else 
		{
			TimeSeconds leftGameTime = entry->gameInfo_->info->gameTime - entry->gameInfo_->gameSpendTime;
			if (leftGameTime < entry->gameInfo_->info->stepTime)
			{
				entry->gameInfo_->info->realStepTime = leftGameTime;
			}
		}
	}
	TimeSeconds getStepTimeForTimer(const EntryPtr& entry) const
	{
		return entry->gameInfo_->info->realStepTime;
	}
	bool isTurnToPlay(const EntryPtr& entry) const
	{
		bool turnToRed = !(entry->gameInfo_->info->totalSteps % 2);
		return (entry->gameInfo_->type == InGameInfo::kRed && turnToRed) || (entry->gameInfo_->type == InGameInfo::kBlack && !turnToRed);
	}
	TimerId getGameTimer(const EntryPtr& entry) const
	{
		return entry->gameInfo_->info->timer;
	}
	void setGameTimer(const EntryPtr& entry, TimerId timer)
	{
		entry->gameInfo_->info->timer = timer;
	}
	TimeSeconds getStepSpendTime(const EntryPtr& entry) const
	{
		Timestamp now = Timestamp::now();
		TimeSeconds spendTime = static_cast<TimeSeconds>(timeDifference(now, entry->gameInfo_->startTime));
		return spendTime;
	}
	void updateGameTime(const EntryPtr& entry)
	{
		TimeSeconds spendTime = getStepSpendTime(entry);
		entry->gameInfo_->gameSpendTime += spendTime;
	}
	void updateGameInfo(const EntryPtr& entry, const std::string& fen, int mv)
	{
		updateGameTime(entry);
		entry->gameInfo_->info->updatePerStep(fen, mv);
		updateRealStepTime(entry);
	}
	void updateForBackStep(const EntryPtr& entry, const std::string& fen, int mv)
	{
		entry->gameInfo_->info->updateBackStep(fen, mv);
	}
	// for gameover
	void updateUserInfo(const EntryPtr& entry, int changeScore, ::wsun::GameOver::OverType type)
	{
		entry->userInfo_.set_score(entry->userInfo_.score() + changeScore);
		entry->userInfo_.set_total(entry->userInfo_.total() + 1);
		if (type == ::wsun::GameOver::WIN)
		{
			entry->userInfo_.set_nwin(entry->userInfo_.nwin() + 1);
		}
		else if (type == ::wsun::GameOver::LOSS)
		{
			entry->userInfo_.set_nloss(entry->userInfo_.nloss() + 1);
		}
	}

	GameOverPtr packageGameOverMessage(const EntryPtr& selfEntry, const EntryPtr& oppEntry, int changeScore, ::wsun::GameOver::OverType type)
	{
		GameOverPtr message(new ::wsun::GameOver);
		message->set_type(type);
		message->set_changescore(changeScore);
		message->set_selfspendgametime(selfEntry->gameInfo_->gameSpendTime);
		message->set_oppspendgametime(oppEntry->gameInfo_->gameSpendTime);
		return message;
	}

private:
	std::map<int, EntryPtr> entrys_;
	std::map<std::string, int> userList_;
};

// parser codec
class CenterServer : noncopyable
{
public:
  CenterServer(EventLoop* loop, const InetAddress& listenAddr, const InetAddress& loginAddr, const InetAddress& matchAddr)
    : loop_(loop),
			server_(loop, listenAddr, "CenterServer"),
      loginServer_(loop, loginAddr, "LoginServer"),
      matchServer_(loop, matchAddr, "MatchServer"),
			dispatcher_(std::bind(&CenterServer::onUnknownMessage, this, _1, _2, _3, _4)),
			codec_(std::bind(&ProtobufDispatcher::onProtobufMessage, &dispatcher_, _1, _2, _3, _4)),
			manager_(new ServiceManager)
  {
    server_.setConnectionCallback(
        std::bind(&CenterServer::onFrontConnection, this, _1));
    server_.setMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));

    loginServer_.setConnectionCallback(
        std::bind(&CenterServer::onLoginServerConnection, this, _1));
    loginServer_.setMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));

    matchServer_.setConnectionCallback(
        std::bind(&CenterServer::onMatchServerConnection, this, _1));
    matchServer_.setMessageCallback(
        std::bind(&ProtobufCodec::onMessage, &codec_, _1, _2, _3));

		dispatcher_.registerMessageCallback<wsun::Disconnected>(
				std::bind(&CenterServer::onDisconnected, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::LoginRequest>(
				std::bind(&CenterServer::onLoginRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::LoginSuccessResponse>(
				std::bind(&CenterServer::onLoginSuccessResponse, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::LoginFailedResponse>(
				std::bind(&CenterServer::onLoginFailedResponse, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::MatchRequest>(
				std::bind(&CenterServer::onMatchRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::MatchBackendResponse>(
				std::bind(&CenterServer::onMatchBackendResponse, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::MoveStep>(
				std::bind(&CenterServer::onMoveStep, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::Giveup>(
				std::bind(&CenterServer::onGiveup, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::ForgiveRequest>(
				std::bind(&CenterServer::onForgiveRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::ForgiveResponse>(
				std::bind(&CenterServer::onForgiveResponse, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::DrawRequest>(
				std::bind(&CenterServer::onDrawRequest, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::DrawResponse>(
				std::bind(&CenterServer::onDrawResponse, this, _1, _2, _3, _4));
		dispatcher_.registerMessageCallback<wsun::CancelMatchRequest>(
				std::bind(&CenterServer::onCancelMatchRequest, this, _1, _2, _3, _4));

    loginServer_.enableRetry();
    matchServer_.enableRetry();
  }

  void start()
  {
		loop_->runEvery(3, std::bind(&ServiceManager::pinterAllEntryInfo, manager_.get()));
    loginServer_.connect();
    matchServer_.connect();
    server_.start();
  }

private:
	void onFrontConnection(const TcpConnectionPtr& conn)
	{
		if (conn->connected())
		{
			LOG_INFO << "front Connection connected";
			if (frontConn_) 
				conn->disconnected();
			else
			{
				frontConn_ = conn;
				frontConn_->setTcpNoDelay(true);
			}
		}
		else
		{
			LOG_INFO << "front Connection disconnected";
			if (frontConn_) frontConn_.reset();
		}
	}
  void onUnknownMessage(int id, const TcpConnectionPtr& conn,
                        const MessagePtr& message,
                        Timestamp)
  {
    LOG_INFO << "onUnknownMessage: connId=" << id << " " << message->GetTypeName();
    conn->shutdown();
  }

	void onLoginServerConnection(const TcpConnectionPtr& conn)
	{
		if (conn->connected())
		{
			LOG_INFO << "login Connection connected";
			loginConn_ = conn;
			loginConn_->setTcpNoDelay(true);
		}
		else
		{
			LOG_INFO << "login Connection disconnected";
			loginConn_.reset();
		}
	}
	void onMatchServerConnection(const TcpConnectionPtr& conn)
	{
		if (conn->connected())
		{
			LOG_INFO << "match Connection connected";
			matchConn_ = conn;
			matchConn_->setTcpNoDelay(true);
		}
		else
		{
			LOG_INFO << "match Connection disconnected";
			matchConn_.reset();
		}
	}
	void debugInfo(int id, const MessagePtr& msg)
	{
		LOG_INFO << "conn id=" << id << ", message_type: " << msg->GetTypeName();
	}

	int getChangeScore(::wsun::GameOver::OverType type)
	{
		int score = 10;
		if (type == ::wsun::GameOver::SELF_TIMEOUT || 
				type == ::wsun::GameOver::SELF_GIVEUP ||
				type == ::wsun::GameOver::LOSS)
		{
			score = -score;
		}
		else if (type == ::wsun::GameOver::DRAW)
		{
			score = 0;
		}
		return score;
	}
	void gameOver(const EntryPtr& selfEntry, const EntryPtr& oppEntry, ::wsun::GameOver::OverType type)
	{
		manager_->updateGameTime(selfEntry);
		loop_->cancel(manager_->getGameTimer(selfEntry));
		GameOverPtr selfMessage;
		GameOverPtr oppMessage;
		int selfChangeScore = getChangeScore(type);
		int oppChangeScore = -selfChangeScore;
		if (type == ::wsun::GameOver::DRAW)
		{
			int changeScore = getChangeScore(type);
			manager_->updateUserInfo(selfEntry, changeScore, type);
			manager_->updateUserInfo(oppEntry, changeScore, type);
			selfMessage = manager_->packageGameOverMessage(selfEntry, oppEntry, changeScore, type);
			oppMessage = manager_->packageGameOverMessage(oppEntry, selfEntry, changeScore, type);
		}
		else if (type == ::wsun::GameOver::SELF_TIMEOUT)
		{
			manager_->updateUserInfo(selfEntry, selfChangeScore, ::wsun::GameOver::LOSS);
			manager_->updateUserInfo(oppEntry, oppChangeScore, ::wsun::GameOver::WIN);
			selfMessage = manager_->packageGameOverMessage(selfEntry, oppEntry, selfChangeScore, type);
			oppMessage = manager_->packageGameOverMessage(oppEntry, selfEntry, oppChangeScore, ::wsun::GameOver::OPP_TIMEOUT);
		}
		else if (type == ::wsun::GameOver::SELF_GIVEUP)
		{
			manager_->updateUserInfo(selfEntry, selfChangeScore, ::wsun::GameOver::LOSS);
			manager_->updateUserInfo(oppEntry, oppChangeScore, ::wsun::GameOver::WIN);
			selfMessage = manager_->packageGameOverMessage(selfEntry, oppEntry, selfChangeScore, type);
			oppMessage = manager_->packageGameOverMessage(oppEntry, selfEntry, oppChangeScore, ::wsun::GameOver::OPP_GIVEUP);
		}
		else if (type == ::wsun::GameOver::WIN)
		{
			manager_->updateUserInfo(selfEntry, selfChangeScore, ::wsun::GameOver::WIN);
			manager_->updateUserInfo(oppEntry, oppChangeScore, ::wsun::GameOver::LOSS);
			selfMessage = manager_->packageGameOverMessage(selfEntry, oppEntry, selfChangeScore, type);
			oppMessage = manager_->packageGameOverMessage(oppEntry, selfEntry, oppChangeScore, ::wsun::GameOver::LOSS);
		}

		// send new userinfo to login server
		::wsun::UpdateUserInfo selfInfo;
		::wsun::UpdateUserInfo oppInfo;
		selfInfo.mutable_info()->CopyFrom(selfEntry->userInfo_);
		oppInfo.mutable_info()->CopyFrom(oppEntry->userInfo_);
		sendMessage(selfEntry->connId_, loginConn_, selfInfo);
		sendMessage(oppEntry->connId_, loginConn_, oppInfo);
		
		// send message to two player
		if (manager_->isOnPlaying(selfEntry))
			sendMessage(selfEntry->connId_, frontConn_, *selfMessage);
		if (manager_->isOnPlaying(oppEntry))
			sendMessage(oppEntry->connId_, frontConn_, *oppMessage);

		manager_->destroyRoom(selfEntry, oppEntry);
	}

	void onTimeOut(const EntryPtr& entry)
	{
		EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
		gameOver(entry, oppEntry, ::wsun::GameOver::SELF_TIMEOUT);
	}
	void startNewGame(const EntryPtr& redPlayer, const EntryPtr& blackPlayer)
	{
		manager_->initStartGameTime(redPlayer);
		TimeSeconds delay = manager_->getStepTimeForTimer(redPlayer);
		TimerId timer = loop_->runAfter(delay, std::bind(&CenterServer::onTimeOut, this, redPlayer));
		manager_->setGameTimer(redPlayer, timer);

		// send message
		::wsun::MatchResponse res;
		res.set_type(redPlayer->gameInfo_->info->roomType);
		{
			res.set_selftype(::wsun::MatchResponse::RED);
			UserInfo* oppUser = new UserInfo(blackPlayer->userInfo_);
			res.set_allocated_oppuser(oppUser);
			sendMessage(redPlayer->connId_, frontConn_, res);
		}
		{
			res.set_selftype(::wsun::MatchResponse::BLACK);
			UserInfo* oppUser = new UserInfo(redPlayer->userInfo_);
			res.set_allocated_oppuser(oppUser);
			sendMessage(blackPlayer->connId_, frontConn_, res);
		}
	}

	void sendMessage(int id, const TcpConnectionPtr& conn, const ::google::protobuf::Message& msg)
	{
		codec_.send(id, conn, msg);
	}

	void sendCancelMatchBackendRequest(const EntryPtr& entry)
	{
			::wsun::CancelMatchBackendRequest req;
			req.set_username(entry->userInfo_.username());
			sendMessage(entry->connId_, matchConn_, req);
	}

	void onDisconnected(int id, const TcpConnectionPtr& conn, const DisconnectedPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr entry = manager_->findEntryByConnId(id);
		if (!entry) return ;

		// 如果正在匹配中，需要向match server 发送取消匹配请求
		if (entry->state_ == Entry::kMatching)
		{
			sendCancelMatchBackendRequest(entry);
		}

		if (manager_->isOnPlaying(entry))
		{
			entry->state_ = Entry::kDisconnecteInPlaying;
			EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
			if (manager_->isOnPlaying(oppEntry))
			{
				::wsun::OppDisconnected message;
				sendMessage(oppEntry->connId_, frontConn_, message);
			}
		}
		else
		{
			manager_->outOfHall(entry->connId_, entry->userInfo_.username());
		}
	}
	void onReconnected(int newId, int oldId)
	{
		EntryPtr entry = manager_->findEntryByConnId(oldId);
		manager_->outOfHall(oldId, entry->userInfo_.username());
		entry->state_ = Entry::kPlaying;
		manager_->intoHall(newId, entry);
		EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
		if (manager_->isOnPlaying(oppEntry))
		{
			::wsun::OppReconnected msg;
			sendMessage(oppEntry->connId_, frontConn_, msg);
		}
		::wsun::GameSituation situation;
		// package situation message
		{
			bool isRed = false;
			if (entry->gameInfo_->type == InGameInfo::kRed)
			{
				isRed = true;
			}
			situation.set_red(isRed);
			situation.set_lastmv(entry->gameInfo_->info->lastMoveStep);
			situation.set_fen(entry->gameInfo_->info->fen);
			situation.set_roomtype(entry->gameInfo_->info->roomType);
			UserInfo* selfInfo = new UserInfo(entry->userInfo_);
			UserInfo* oppInfo = new UserInfo(oppEntry->userInfo_);
			situation.set_allocated_self(selfInfo);
			situation.set_allocated_opp(oppInfo);
			bool turnToSelf = manager_->isTurnToPlay(entry);
			situation.set_turntome(turnToSelf);
			if (turnToSelf)
			{
				TimeSeconds stepSpendTime = manager_->getStepSpendTime(entry);
				situation.mutable_selftime()->set_stepspendtime(stepSpendTime);
				situation.mutable_selftime()->set_gamespendtime(entry->gameInfo_->gameSpendTime + stepSpendTime);
				situation.mutable_opptime()->set_gamespendtime(oppEntry->gameInfo_->gameSpendTime);
			}
			else
			{
				TimeSeconds stepSpendTime = manager_->getStepSpendTime(oppEntry);
				situation.mutable_opptime()->set_stepspendtime(stepSpendTime);
				situation.mutable_opptime()->set_gamespendtime(oppEntry->gameInfo_->gameSpendTime + stepSpendTime);
				situation.mutable_selftime()->set_gamespendtime(entry->gameInfo_->gameSpendTime);
			}
		}
		
		sendMessage(newId, frontConn_, situation);
	}
	void onLoginRequest(int id, const TcpConnectionPtr& conn, const LoginRequestPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		sendMessage(id, loginConn_, *msg);
	}
	void onLoginSuccessResponse(int id, const TcpConnectionPtr& conn, const LoginSuccessResponsePtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		std::string username = msg->userinfo().username();
		int oldId = manager_->findEntryIdByUsername(username);
		// 正常登录
		if (oldId == -1)
		{
			manager_->intoHall(id, msg->userinfo());
			sendMessage(id, frontConn_, *msg);
		}
		else
		{
			// 同一连接重复发送登录请求, 不予理会
			if(oldId == id) return;
			EntryPtr entry = manager_->findEntryByConnId(oldId);
			assert(entry);
			// reconnected
			if (entry->state_ == Entry::kDisconnecteInPlaying)
			{
				onReconnected(id, oldId);
			}
			else // multi login, response
			{
				::wsun::LoginFailedResponse res;
				res.set_reason(::wsun::LoginFailedResponse::MULTI_LOGIN);
				sendMessage(id, frontConn_, res);
			}
		}
	}
	void onLoginFailedResponse(int id, const TcpConnectionPtr& conn, const LoginFailedResponsePtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		sendMessage(id, frontConn_, *msg);
	}
	void onMatchRequest(int id, const TcpConnectionPtr& conn, const MatchRequestPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr entry = manager_->findEntryByConnId(id);
		if (entry->state_ == Entry::kOnline)
		{
			// send request to matchServer_;
			::wsun::MatchBackendRequest req;
			req.mutable_info()->set_type(msg->type());
			req.mutable_info()->set_score(entry->userInfo_.score());
			req.mutable_info()->set_username(entry->userInfo_.username());
			sendMessage(id, matchConn_, req);
			entry->state_ = Entry::kMatching;
		}
	}

	void onMatchBackendResponse(int id, const TcpConnectionPtr& conn, const MatchBackendResponsePtr& msg, Timestamp)
	{
		//debugInfo(id, msg);

		EntryPtr redEntry = manager_->findEntryByUsername(msg->redusername());
		EntryPtr blackEntry = manager_->findEntryByUsername(msg->blackusername());

		if (redEntry && blackEntry && 
				redEntry->state_ == Entry::kMatching && 
				blackEntry->state_ == Entry::kMatching)
		{
			manager_->createRoom(redEntry, blackEntry, msg->type());
			startNewGame(redEntry, blackEntry);
		}
	}

	void onMoveStep(int id, const TcpConnectionPtr& conn, const MoveStepPtr& msg, Timestamp)
	{
		EntryPtr selfEntry = manager_->findEntryByConnId(id);
		if (manager_->isOnPlaying(selfEntry) && manager_->isTurnToPlay(selfEntry))
		{
			EntryPtr oppEntry = manager_->findOppEntryByEntry(selfEntry);
			assert(oppEntry);
			//send message to opp player
			if(msg->over())
			{
				if(manager_->isOnPlaying(oppEntry))
				{
					sendMessage(oppEntry->connId_, frontConn_, *msg);
				}
				gameOver(selfEntry, oppEntry, ::wsun::GameOver::WIN);
			}
			else
			{
				loop_->cancel(manager_->getGameTimer(selfEntry));
				manager_->updateGameInfo(selfEntry, msg->fen(), msg->mv());
				manager_->initStartGameTime(oppEntry);
				TimeSeconds delay = manager_->getStepTimeForTimer(oppEntry);
				TimerId timer = loop_->runAfter(delay, std::bind(&CenterServer::onTimeOut, this, oppEntry));
				manager_->setGameTimer(oppEntry, timer);
				//send message to opp player
				if(manager_->isOnPlaying(oppEntry))
				{
					sendMessage(oppEntry->connId_, frontConn_, *msg);
				}
			}
		}
		else
		{
			// 有可能定时器触发，然后结束对局了，state可能为disconnected 或 online
			LOG_INFO << "move step: error state";
		}
	}

	void onGiveup(int id, const TcpConnectionPtr& conn, const GiveupPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr selfEntry = manager_->findEntryByConnId(id);
		if (manager_->isOnPlaying(selfEntry))
		{
			EntryPtr oppEntry = manager_->findOppEntryByEntry(selfEntry);
			assert(oppEntry);
			gameOver(selfEntry, oppEntry, ::wsun::GameOver::SELF_GIVEUP);
		}
		else
		{
			// 有可能定时器触发，然后结束对局了，state可能为disconnected 或 online
			LOG_INFO << "giveup: error state";
		}
	}

	void onForgiveRequest(int id, const TcpConnectionPtr& conn, const ForgiveRequestPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr entry = manager_->findEntryByConnId(id);
		EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
		// send forgive request to opp
		// 必须保证是对方走棋时才可悔棋
		if(manager_->isOnPlaying(oppEntry) && manager_->isTurnToPlay(oppEntry))
		{
			sendMessage(oppEntry->connId_, frontConn_, *msg);
		}
	}

	void onForgiveResponse(int id, const TcpConnectionPtr& conn, const ForgiveResponsePtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr selfEntry = manager_->findEntryByConnId(id);
		EntryPtr oppEntry = manager_->findOppEntryByEntry(selfEntry);
		if (msg->agree())
		{
			loop_->cancel(manager_->getGameTimer(selfEntry));
			manager_->updateForBackStep(selfEntry, msg->fen(), msg->mv());
			manager_->initStartGameTime(oppEntry);
			TimeSeconds delay = manager_->getStepTimeForTimer(oppEntry);
			TimerId timer = loop_->runAfter(delay, std::bind(&CenterServer::onTimeOut, this, oppEntry));
			manager_->setGameTimer(oppEntry, timer);
		}
		if(manager_->isOnPlaying(oppEntry))
		{
			sendMessage(oppEntry->connId_, frontConn_, *msg);
		}
	}

	void onDrawRequest(int id, const TcpConnectionPtr& conn, const DrawRequestPtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr entry = manager_->findEntryByConnId(id);
		if (manager_->isOnPlaying(entry))
		{
			EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
			// send draw request to opp
			if(manager_->isOnPlaying(oppEntry))
			{
				sendMessage(oppEntry->connId_, frontConn_, *msg);
			}
		}
	}

	void onDrawResponse(int id, const TcpConnectionPtr& conn, const DrawResponsePtr& msg, Timestamp)
	{
		//debugInfo(id, msg);
		EntryPtr entry = manager_->findEntryByConnId(id);
		EntryPtr oppEntry = manager_->findOppEntryByEntry(entry);
		if (msg->agree())
		{
			gameOver(entry, oppEntry, ::wsun::GameOver::DRAW);
		}
		else
		{
			// send draw request to opp
			if(manager_->isOnPlaying(oppEntry))
			{
				sendMessage(oppEntry->connId_, frontConn_, *msg);
			}
		}
	}

	void onCancelMatchRequest(int id, const TcpConnectionPtr& conn, const CancelMatchRequestPtr&, Timestamp)
	{
		// FIXME: 如果在此之前刚好收到match server 的匹配响应呢？该怎么做
		// 可以让客户端程序处理此类问题, 不用服务器处理
		// 客户端发送完取消匹配请求后如果马上收到之前匹配请求的响应,则依然开始对局
		EntryPtr entry = manager_->findEntryByConnId(id);
		if (entry && entry->state_ == Entry::kMatching)
		{
			entry->state_ = Entry::kOnline;
			sendCancelMatchBackendRequest(entry);
		}
	}

private:
	EventLoop* loop_;
	TcpServer server_;
	TcpClient loginServer_;
	TcpClient matchServer_;
	TcpConnectionPtr frontConn_;
	TcpConnectionPtr loginConn_;
	TcpConnectionPtr matchConn_;
	ProtobufDispatcher dispatcher_;
	ProtobufCodec codec_;

	// users information
	std::unique_ptr<ServiceManager> manager_;
};

int main(int argc, char** argv)
{
	EventLoop loop;
	const InetAddress listenAddr(2022);
	const InetAddress loginAddr(2020);
	const InetAddress matchAddr(2021);
	CenterServer server(&loop, listenAddr, loginAddr, matchAddr);
	server.start();
	loop.loop();
}
