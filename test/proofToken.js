require('../scripts/jsHelpers.js')

const fs = require('fs')
const csv = require('csv-parser')
const json2csv = require('json2csv')

const BigNumber = web3.BigNumber
let chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
var chaiStats = require('chai-stats')
var chaiBigNumber = require('chai-bignumber')(BigNumber)
chai.use(chaiAsPromised).use(chaiBigNumber).use(chaiStats).should()

import {
  DEFAULT_GAS,
  DEFAULT_GAS_PRICE,
  TOKENS_ALLOCATED_TO_PROOF
} from '../scripts/testConfig.js'

import {
  getAddress,
  expectInvalidOpcode
} from '../scripts/helpers.js'

import {
  transferOwnership
} from '../scripts/ownershipHelpers.js'

import {
  getTokenBalance,
  getTotalSupply,
  mintToken,
  getOwner,
  transferToken,
  importBalances,
  lockBalances
} from '../scripts/tokenHelpers.js'

const assert = chai.assert
const should = chai.should()
const expect = chai.expect

const ProofPresaleToken = artifacts.require('./ProofPresaleToken.sol')
const ProofToken = artifacts.require('./ProofToken.sol')
const TokenSale = artifacts.require('./TokenSale.sol')

contract('proofToken', (accounts) => {
  let tokenSale
  let tokenSaleAddress
  let proofToken
  let proofPresaleToken
  let proofPresaleTokenAddress
  let proofTokenAddress

  let fund = accounts[0]
  let sender = accounts[1]
  let receiver = accounts[2]
  let hacker = accounts[3]
  let wallet = accounts[4]
  let proofWalletAddress = accounts[9]

  let startBlock
  let endBlock

  beforeEach(async function() {
    startBlock = web3.eth.blockNumber + 10
    endBlock = web3.eth.blockNumber + 20

    proofPresaleToken = await ProofPresaleToken.new()
    proofPresaleTokenAddress = await getAddress(proofPresaleToken)

    proofToken = await ProofToken.new(proofPresaleTokenAddress, proofWalletAddress)
    proofTokenAddress = await getAddress(proofToken)

    tokenSale = await TokenSale.new(
      wallet,
      proofTokenAddress,
      startBlock,
      endBlock
    )

    tokenSaleAddress = await getAddress(tokenSale)
  })

  describe('Initial State', function () {
    beforeEach(async function() {
      await transferOwnership(proofToken, fund, tokenSaleAddress)
    })

    it('should start with a totalSupply equal to the number of presale tokens', async function() {
      let totalSupply = await getTotalSupply(proofToken)
      let presaleTotalSupply = await getTotalSupply(proofPresaleToken)

      totalSupply.should.be.equal(presaleTotalSupply + TOKENS_ALLOCATED_TO_PROOF)
    })

    it('should be owned by token sale contract', async function() {
      let proofTokenOwner = await getOwner(proofToken)
      proofTokenOwner.should.be.equal(tokenSaleAddress)
    })

    it('should have 18 decimals', async function() {
      let decimals = await proofToken.decimals.call()
      decimals.should.be.bignumber.equal(18)
    })

    it('should have Proof Token Name', async function() {
      let name = await proofToken.name.call()
      name.should.be.equal('Proof Token')
    })

    it('should have PRFT symbol', async function() {
      let symbol = await proofToken.symbol.call()
      symbol.should.be.equal('PRFT')
    })
  })

  describe('Import balances', function () {
    it('should correctly import a few balances', async function() {
      let addresses = [sender, receiver]
      let balances = [100, 100]
      await importBalances(proofToken, fund, addresses, balances)

      let senderBalance = await getTokenBalance(proofToken, sender)
      let receiverBalance = await getTokenBalance(proofToken, receiver)

      senderBalance.should.be.equal(100)
      receiverBalance.should.be.equal(100)
    })

    it('should correctly import balances from a CSV file', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
          .pipe(csv())
          .on('data', function (data) {
            addresses.push(data['address'])
            balances.push(data['balance'])
          })
          .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()
      await importBalances(proofToken, fund, addresses, balances)

      for (let i = 0; i++; i < 10) {
        let balance = await getTokenBalance(proofToken, addresses[index])
        balance.should.be.equal(balances[i])
      }
    })


    it('should not import balances if caller is not the owner of the contract', async function() {

      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
        .pipe(csv())
        .on('data', function (data) {
          addresses.push(data['address'])
          balances.push(data['balances'])
        })
        .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()
      await expectInvalidOpcode(importBalances(proofToken, hacker, addresses, balances))
    })


    it('can not lock the presale balances before the balances are imported', async function() {
      await expectInvalidOpcode(lockBalances(proofToken, fund))
    })

    it('should have import flag set to false before the balances are imported', async function() {
      let importFlag = await proofToken.presaleBalancesImported.call()
      importFlag.should.be.false
    })

    it('should set import flag set to true after the balances are imported', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
        .pipe(csv())
        .on('data', function(data) {
          addresses.push(data['address'])
          balances.push(data['balance'])
        })
        .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()
      await importBalances(proofToken, fund, addresses, balances)

      let importFlag = await proofToken.presaleBalancesImported.call()
      importFlag.should.be.true
    })

    it('can lock the presale balances after the balances are imported', async function() {
      let addresses = []
      let balances = []

      const writeData = new Promise((resolve, reject) => {
        fs.createReadStream('./test/balances.csv')
          .pipe(csv())
          .on('data', function (data) {
            addresses.push(data['address'])
            balances.push(data['balance'])
          })
          .on('end', resolve)
      })

      await writeData
      balances = balances.toNumber()
      await importBalances(proofToken, fund, addresses, balances)

      for (let i = 0; i++; i < 10) {
        let balance = await getTokenBalance(proofToken, addresses[index])
        balance.should.be.equal(balances[i])
      }

      await lockBalances(proofToken, fund).should.be.fulfilled

      let balancesLocked = await proofToken.presaleBalancesLocked.call()
      balancesLocked.should.be.true
    })


  })

  describe('Minting', function () {
    it('should be mintable by owner contract', async function() {
      let initialTokenBalance = await getTokenBalance(proofToken, receiver)
      await mintToken(proofToken, fund, receiver, 100)

      let tokenBalance = await getTokenBalance(proofToken, receiver)
      let balanceIncrease = tokenBalance - initialTokenBalance

      balanceIncrease.should.be.equal(100)
    })

    it('should be mintable', async function() {
      let mintingFinished = await proofToken.mintingFinished.call()
      mintingFinished.should.be.equal(false)
    })

    it('should not be mintable by non-owner', async function() {
      transferOwnership(proofToken, fund, tokenSaleAddress)

      let initialTokenBalance = await getTokenBalance(proofToken, receiver)

      let params = { from:hacker, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(proofToken.mint(receiver, 100, params))

      let tokenBalance = await getTokenBalance(proofToken, receiver)
      let balanceIncrease = tokenBalance - initialTokenBalance

      balanceIncrease.should.be.equal(0)
    })

    it('can not be stopped by non-owner', async function() {
      transferOwnership(proofToken, fund, tokenSaleAddress)

      let params = { from: hacker, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(proofToken.finishMinting(params))

      let mintingFinished = await proofToken.mintingFinished.call()
      mintingFinished.should.be.equal(false)
    })
  })

  describe('Transfers', function () {
    it('should be transferable ', async function() {
      await mintToken(proofToken, fund, sender, 10000)

      let initialSenderBalance = await getTokenBalance(proofToken, sender)
      let initialReceiverBalance = await getTokenBalance(proofToken, receiver)

      await transferToken(proofToken, sender, receiver, 10000)

      let senderBalance = await getTokenBalance(proofToken, sender)
      let receiverBalance = await getTokenBalance(proofToken, receiver)

      let senderBalanceVariation = senderBalance - initialSenderBalance
      let receiverBalanceVariation = receiverBalance - initialReceiverBalance

      senderBalanceVariation.should.be.equal(-10000)
      receiverBalanceVariation.should.be.equal(10000)
    })

    it('should not allow to transfer more than balance', async function() {
      await mintToken(proofToken, fund, sender, 100)

      let params = { from: sender, gas: DEFAULT_GAS, gasPrice: DEFAULT_GAS_PRICE }
      await expectInvalidOpcode(proofToken.transfer(receiver, 101, params))
    })
  })

  describe('Token import', function () {
  })

})