// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RowanStocks — on-chain watchlist + daily check-in + agent briefing log
/// @notice Built for Base Stocks Maxxing Season (Agentic Stock Finance track).
///         Deployed on Base Sepolia testnet only. No real assets, no token,
///         no fees, no owner/admin powers. The agent address may only post
///         briefing records; it cannot move funds or change anyone's data.
contract RowanStocks {
    /// @notice The AI agent wallet allowed to post daily briefing records.
    address public immutable agent;

    /// @notice Daily check-in streak per wallet (UTC day based).
    mapping(address => uint256) public checkInStreak;
    /// @notice Total check-ins per wallet.
    mapping(address => uint256) public checkInTotal;
    /// @notice Last UTC day (unix / 1 days) a wallet checked in.
    mapping(address => uint256) public lastCheckInDay;

    /// @notice Stock watchlist per wallet, e.g. ["AAPL", "TSLA", "NVDA"].
    mapping(address => string[]) private _watchlists;

    struct Briefing {
        string day; // e.g. "2026-11-22"
        string uri; // short text or link to the full briefing
        uint256 postedAt;
    }
    Briefing[] public briefings;

    event CheckedIn(address indexed user, uint256 streak, uint256 total);
    event WatchlistUpdated(address indexed user, string[] tickers);
    event BriefingPosted(uint256 indexed id, string day, string uri);

    error AlreadyCheckedInToday();
    error TooManyTickers();
    error TickerTooLong();
    error OnlyAgent();

    constructor(address agent_) {
        agent = agent_;
    }

    /// @notice Free daily check-in (once per UTC day). Builds a streak.
    function checkIn() external {
        uint256 today = block.timestamp / 1 days;
        if (lastCheckInDay[msg.sender] == today) revert AlreadyCheckedInToday();
        if (lastCheckInDay[msg.sender] == today - 1) {
            checkInStreak[msg.sender] += 1;
        } else {
            checkInStreak[msg.sender] = 1;
        }
        lastCheckInDay[msg.sender] = today;
        checkInTotal[msg.sender] += 1;
        emit CheckedIn(msg.sender, checkInStreak[msg.sender], checkInTotal[msg.sender]);
    }

    /// @notice Save your tokenized-stock watchlist (max 10 tickers).
    function setWatchlist(string[] calldata tickers) external {
        if (tickers.length > 10) revert TooManyTickers();
        for (uint256 i = 0; i < tickers.length; i++) {
            if (bytes(tickers[i]).length == 0 || bytes(tickers[i]).length > 12) {
                revert TickerTooLong();
            }
        }
        delete _watchlists[msg.sender];
        for (uint256 i = 0; i < tickers.length; i++) {
            _watchlists[msg.sender].push(tickers[i]);
        }
        emit WatchlistUpdated(msg.sender, tickers);
    }

    /// @notice Read anyone's watchlist.
    function getWatchlist(address user) external view returns (string[] memory) {
        return _watchlists[user];
    }

    /// @notice The agent posts a daily briefing record (date + short text/link).
    function postBriefing(string calldata day, string calldata uri) external {
        if (msg.sender != agent) revert OnlyAgent();
        briefings.push(Briefing({day: day, uri: uri, postedAt: block.timestamp}));
        emit BriefingPosted(briefings.length - 1, day, uri);
    }

    function getBriefingCount() external view returns (uint256) {
        return briefings.length;
    }
}
