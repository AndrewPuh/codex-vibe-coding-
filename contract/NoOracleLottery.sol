// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title NoOracleLottery
/// @notice Учебный testnet-контракт. Намеренно использует небезопасную случайность.
/// @dev НЕ использовать с реальными деньгами и не деплоить в mainnet.
contract NoOracleLottery {
    address public owner;
    address payable public treasury;
    uint256 public ticketPrice;
    uint16 public feeBps;
    uint256 public roundId = 1;
    uint256 public currentPot;

    address[] private entries;
    mapping(uint256 => address) public winners;
    mapping(uint256 => uint256) public prizes;
    mapping(address => uint256) public pendingWithdrawals;

    bool private locked;

    event TicketsPurchased(uint256 indexed roundId, address indexed buyer, uint256 quantity, uint256 paid);
    event WinnerDrawn(uint256 indexed roundId, address indexed winner, uint256 prize, uint256 fee);
    event Withdrawal(address indexed account, uint256 amount);
    event SettingsChanged(uint256 ticketPrice, uint16 feeBps, address treasury);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address payable treasury_, uint256 ticketPrice_, uint16 feeBps_) {
        require(treasury_ != address(0), "Zero treasury");
        require(ticketPrice_ > 0, "Zero price");
        require(feeBps_ <= 2000, "Fee too high");
        owner = msg.sender;
        treasury = treasury_;
        ticketPrice = ticketPrice_;
        feeBps = feeBps_;
    }

    function buyTickets(uint256 quantity) external payable {
        require(quantity > 0 && quantity <= 50, "Quantity 1-50");
        require(msg.value == ticketPrice * quantity, "Wrong ETH amount");

        for (uint256 i; i < quantity; ++i) {
            entries.push(msg.sender);
        }

        currentPot += msg.value;
        emit TicketsPurchased(roundId, msg.sender, quantity, msg.value);
    }

    /// @notice НАМЕРЕННО НЕБЕЗОПАСНЫЙ розыгрыш.
    /// @dev Владелец выбирает момент вызова; данные блока не являются честным RNG.
    function drawWinner() external onlyOwner {
        require(entries.length >= 2, "Need at least 2 tickets");
        require(currentPot > 0, "Empty pot");

        bytes32 weakEntropy = keccak256(
            abi.encodePacked(
                block.prevrandao,
                block.timestamp,
                blockhash(block.number - 1),
                entries.length,
                currentPot,
                msg.sender
            )
        );

        address winner = entries[uint256(weakEntropy) % entries.length];
        uint256 fee = (currentPot * feeBps) / 10_000;
        uint256 prize = currentPot - fee;

        winners[roundId] = winner;
        prizes[roundId] = prize;
        pendingWithdrawals[winner] += prize;
        pendingWithdrawals[treasury] += fee;

        emit WinnerDrawn(roundId, winner, prize, fee);

        delete entries;
        currentPot = 0;
        unchecked { ++roundId; }
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    function entriesCount() external view returns (uint256) {
        return entries.length;
    }

    function entryAt(uint256 index) external view returns (address) {
        return entries[index];
    }

    function setSettings(uint256 ticketPrice_, uint16 feeBps_, address payable treasury_) external onlyOwner {
        require(ticketPrice_ > 0, "Zero price");
        require(feeBps_ <= 2000, "Fee too high");
        require(treasury_ != address(0), "Zero treasury");
        ticketPrice = ticketPrice_;
        feeBps = feeBps_;
        treasury = treasury_;
        emit SettingsChanged(ticketPrice_, feeBps_, treasury_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {
        revert("Buy tickets through buyTickets");
    }
}