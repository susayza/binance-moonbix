const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");
const readline = require("readline");
const logger = require("./config/logger");
const { HttpsProxyAgent } = require("https-proxy-agent");
const prompt = require("prompt-sync")();


class Binance {
  constructor() {
    this.currTime = Date.now();
    this.rs = 0;
    this.gameResponse = null;
    this.game = null;
    this.headers = {
			'Accept': '*/*',
			'Accept-Language': 'en-US',
			"Bnc-Uuid": "",
			'Clienttype': "web",
			'Content-Type': 'application/json',
			'Csrftoken': 'd41d8cd98f00b204e9800998ecf8427e',
			'Device-Info': "",
			"Priority": "u=1, i",
			"Fvideo-Id": "33bda003f0aea1fa919ee400b6e9f40775ff584a",
			"Fvideo-Token": "",
			"Lang": "en",
			'Origin': 'https://www.binance.com',
			'Referer': 'https://www.binance.com/en/game/tg/moon-bix',
			'Sec-Fetch-Dest': 'empty',
			'Sec-Fetch-Mode': 'cors',
			'Sec-Fetch-Site': 'same-origin',
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
			"Fvideo-Id": "33bda003f0aea1fa919ee400b6e9f40775ff584a",
			"Fvideo-Token": "",
    };
    this.proxyConfig = this.loadProxyConfig();
    this.axios = this.createAxiosInstance();
  }

  loadProxyConfig() {
    const configPath = path.join(__dirname, "config", "config.json");
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return config;
    } catch (error) {
      logger.error(`Failed to load proxy configuration: ${error.message}`);
      return { useProxy: false };
    }
  }
	
	generateFvideoToken(length) {
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
		const digits = '0123456789';
		const characters1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

		let randomString = '';
		for (let i = 0; i < length - 3; i++) {
			randomString += characters.charAt(Math.floor(Math.random() * characters.length));
		}

		randomString += '=';
		randomString += digits.charAt(Math.floor(Math.random() * digits.length));
		randomString += characters1.charAt(Math.floor(Math.random() * characters1.length));

		return randomString;
	}


  createAxiosInstance() {
    const axiosConfig = { headers: this.headers };

    if (this.proxyConfig.useProxy) {
      const proxyUrl = `${this.proxyConfig.proxyProtocol}://${this.proxyConfig.proxyAuth.username}:${this.proxyConfig.proxyAuth.password}@${this.proxyConfig.proxyHost}:${this.proxyConfig.proxyPort}`;
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false; // Disable Axios' default proxy behavior
    }

    return axios.create(axiosConfig);
  }

  log(msg, level = "info") {
    logger.log(level, msg);
  }

  async countdown(seconds) {
    for (let i = seconds; i > 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Waiting ${i} seconds to continue...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }
	
  async sleep(seconds) {
    for (let i = seconds; i > 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`Sleep ${i} seconds ...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }

  encrypt(text, key) {
    const iv = crypto.randomBytes(12);
    const ivBase64 = iv.toString("base64");
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key),
      ivBase64.slice(0, 16)
    );
    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");
    return ivBase64 + encrypted;
  }

  async callBinanceAPI(queryString) {
    const accessTokenUrl =
      "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/third-party/access/accessToken";
    const userInfoUrl =
      "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/user/user-info";

    try {
      const accessTokenResponse = await this.axios.post(accessTokenUrl, {
        queryString: queryString,
        socialType: "telegram",
      });

      if (
        accessTokenResponse.data.code !== "000000" ||
        !accessTokenResponse.data.success
      ) {
        throw new Error(
          `Failed to get access token: ${accessTokenResponse.data.message}`
        );
      }

      const accessToken = accessTokenResponse.data.data.accessToken;
      const userInfoHeaders = {
        ...this.headers,
        "X-Growth-Token": accessToken,
      };

      const userInfoResponse = await this.axios.post(
        userInfoUrl,
        {
          resourceId: 2056,
        },
        { headers: userInfoHeaders }
      );

      this.log(
        `User info response: ${JSON.stringify(userInfoResponse.data)}`,
        "debug"
      );

      if (
        userInfoResponse.data.code !== "000000" ||
        !userInfoResponse.data.success ||
        !userInfoResponse.data.data.metaInfo
      ) {
        throw new Error(
          `Failed to get valid user info: ${JSON.stringify(
            userInfoResponse.data
          )}`
        );
      }

      return { userInfo: userInfoResponse.data.data, accessToken };
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        this.log(
          `API call failed: ${error.response.status} - ${error.response.data}`,
          "error"
        );
      } else if (error.request) {
        // The request was made but no response was received
        this.log("API call failed: No response received", "error");
      } else {
        // Something happened in setting up the request that triggered an Error
        this.log(`API call failed: ${error.message}`, "error");
      }
      return null;
    }
  }

  async startGame(accessToken, user_id) {
    try {
			const video_token = this.generateFvideoToken(196);
      const response = await this.axios.post(
        "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/game/start",
        { resourceId: 2056 },
        { headers: { ...this.headers, "X-Growth-Token": accessToken, "Fvideo-Token": video_token } }
      );

      this.gameResponse = response.data;

			const sessionId = this.gameResponse.data.sessionId;

			const captcha_data = `bizId=tg_mini_game_play&sv=20220812&lang=en&securityCheckResponseValidateId=${this.gameResponse.data.securityCheckValidateId}&clientType=web`;

			const captcha_header = {
					"accept-encoding": "gzip, deflate, br",
					"accept-language": "en-US,en;q=0.9",
					"content-type": "text/plain; charset=UTF-8",
					"bnc-uuid": "xxx",
					"captcha-sdk-version": "1.0.0",
					"clienttype": "web",
					"device-info": this.headers['Device-Info'],
					"fvideo-id": "xxx",
					"origin": "https://www.binance.com",
					"referer": "https://www.binance.com/",
					'sec-fetch-dest': 'empty',
					'sec-fetch-mode': 'cors',
					'sec-fetch-site': 'same-origin',
					"user-agent": this.headers["User-Agent"],
					"x-captcha-se": "true"
			}
				
			const cap_res  = await this.axios.post(
				"https://api.commonservice.io/gateway-api/v1/public/antibot/getCaptcha",
				captcha_data, 
				{ headers: { captcha_header } }
			);
				
			const captcha_data_ = cap_res.data;
			// this.log("capcha response " + JSON.stringify(captcha_data_), "info");
			
			
			const cap_type = captcha_data_.captchaType;
			const mode = "VANHBAKA"
			const bizId = captcha_data
			const sig = captcha_data_.sig
			const salt = captcha_data_.salt
			const tag = captcha_data_.tag
			const path2 = captcha_data_.path2
			const ek = captcha_data_.ek

			const payload = {
					"mode": mode,
					"bizId": bizId,
					"captchaData": {
							"sig": sig,
							"salt": salt,
							"path2": path2,
							"ek": ek,
							"captchaType": cap_type,
							"tag": tag
					}
			}
			this.log("payload " + JSON.stringify(payload), "info");

			this.log(`Wait to solve captcha....`)
			// #http://91.107.237.34:3000
			const headerhhh = {
				"user_id": user_id
			}
			try{
				const solve = await this.axios.post(
					"http://91.107.237.34:3000/captcha/solve", 
					payload,
					{ headers: { headerhhh } }
				);
				this.log("solve " + JSON.stringify(solve.data), "info")
			}
			catch(err) {
					this.log("SEVER OFFLINE OR SOMETHING WENT WRONG TRY AGAIN LATER!", "error")
					return false
			}
			
			const captcha_token = solver.data.token;
			if (captcha_token == ""){
					this.log("Failed to get captcha token. Try again next round...", "warning")
					const sleep_ = Math.random() * (15 - 10) + 10;
					await this.sleep(sleep_);
					return false;
			}
			this.log("Solved captcha successfully", "info");
			
			video_token = this.generateFvideoToken(196);

      response = await this.axios.post(
        "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/game/start",
        { resourceId: 2056 },
        { headers: { ...this.headers, "X-Growth-Token": accessToken, "Fvideo-Token": video_token, "X-Captcha-Challenge": sig, "X-Captcha-Session-I": sessionId, "X-Captcha-Token": captcha_token } }
      );
			
			
      this.gameResponse = response.data;
			
      if (response.data.code === "000000") {
        this.log("Successfully started game", "info");
        return true;
      }

      if (response.data.code === "116002") {
        this.log("Not enough turns!", "warn");
      } else {
        this.log("Error starting game!", "error");
      }

      return false;
    } catch (error) {
      this.log(`Cannot start game: ${error.message}`, "error");
      return false;
    }
  }

  async getGameData() {
    try {
      const startTime = Date.now();
      const endTime = startTime + 45000;
      const gameTag = this.gameResponse.data.gameTag;
      const itemSettings =
        this.gameResponse.data.cryptoMinerConfig.itemSettingList;

      let currentTime = startTime;
      let score = 100;
      const gameEvents = [];

      while (currentTime < endTime) {
        const timeIncrement =
          Math.floor(Math.random() * (2500 - 1500 + 1)) + 1500;
        currentTime += timeIncrement;

        if (currentTime >= endTime) break;

        const hookPosX = (Math.random() * (275 - 75) + 75).toFixed(3);
        const hookPosY = (Math.random() * (251 - 199) + 199).toFixed(3);
        const hookShotAngle = (Math.random() * 2 - 1).toFixed(3);
        const hookHitX = (Math.random() * (400 - 100) + 100).toFixed(3);
        const hookHitY = (Math.random() * (700 - 250) + 250).toFixed(3);

        let itemType, itemSize, points;

        const randomValue = Math.random();
        if (randomValue < 0.6) {
          const rewardItems = itemSettings.filter(
            (item) => item.type === "REWARD"
          );
          const selectedReward =
            rewardItems[Math.floor(Math.random() * rewardItems.length)];
          itemType = 1;
          itemSize = selectedReward.size;
          points = Math.min(selectedReward.rewardValueList[0], 10);
          score = Math.min(score + points, 250);
        } else if (randomValue < 0.8) {
          const trapItems = itemSettings.filter((item) => item.type === "TRAP");
          const selectedTrap =
            trapItems[Math.floor(Math.random() * trapItems.length)];
          itemType = 1;
          itemSize = selectedTrap.size;
          points = Math.min(Math.abs(selectedTrap.rewardValueList[0]), 20);
          score = Math.max(100, score - points);
        } else {
          const bonusItem = itemSettings.find((item) => item.type === "BONUS");
          if (bonusItem) {
            itemType = 2;
            itemSize = bonusItem.size;
            points = Math.min(bonusItem.rewardValueList[0], 15);
            score = Math.min(score + points, 250);
          } else {
            itemType = 0;
            itemSize = 0;
            points = 0;
          }
        }

        const eventData = `${currentTime}|${hookPosX}|${hookPosY}|${hookShotAngle}|${hookHitX}|${hookHitY}|${itemType}|${itemSize}|${points}`;
        gameEvents.push(eventData);
      }

      const payload = gameEvents.join(";");
      const encryptedPayload = this.encrypt(payload, gameTag);

      this.game = {
        payload: encryptedPayload,
        log: score,
      };

      return true;
    } catch (error) {
      this.log(`Error in getGameData: ${error.message}`, "error");
      this.game = null;
      return false;
    }
  }

  async completeGame(accessToken) {
    const stringPayload = this.game.payload;
    const payload = {
      resourceId: 2056,
      payload: stringPayload,
      log: this.game.log,
    };
    try {
      const response = await this.axios.post(
        "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/game/complete",
        payload,
        { headers: { ...this.headers, "X-Growth-Token": accessToken } }
      );
      const data = response.data;
      if (data.success) {
        this.log(
          `Successfully completed game | Received ${this.game.log} points`,
          "info"
        );
        return true;
      } else {
        this.log(`Failed to complete game: ${JSON.stringify(data)}`, "warn");
        return false;
      }
    } catch (error) {
      this.log(`Error completing game: ${error.message}`, "error");
      return false;
    }
  }

  async getTaskList(accessToken) {
    const taskListUrl =
      "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/task/list";
    try {
      const response = await this.axios.post(
        taskListUrl,
        {
          resourceId: 2056,
        },
        {
          headers: {
            ...this.headers,
            "X-Growth-Token": accessToken,
          },
        }
      );

      if (response.data.code !== "000000" || !response.data.success) {
        throw new Error(`Unable to get task list: ${response.data.message}`);
      }

      const taskList = response.data.data.data[0].taskList.data;
      const resourceIds = taskList
        .filter((task) => task.completedCount === 0)
        .map((task) => task.resourceId);

      return resourceIds;
    } catch (error) {
      this.log(`Unable to get task list: ${error.message}`, "error");
      return null;
    }
  }

  async completeTask(accessToken, resourceId) {
    const completeTaskUrl =
      "https://www.binance.com/bapi/growth/v1/friendly/growth-paas/mini-app-activity/third-party/task/complete";
    try {
      const response = await this.axios.post(
        completeTaskUrl,
        {
          resourceIdList: [resourceId],
          referralCode: null,
        },
        {
          headers: {
            ...this.headers,
            "X-Growth-Token": accessToken,
          },
        }
      );

      if (response.data.code !== "000000" || !response.data.success) {
        throw new Error(`Cannot complete task: ${response.data.message}`);
      }

      if (response.data.data.type) {
        this.log(
          `Successfully completed task ${response.data.data.type}!`,
          "info"
        );
      }

      return true;
    } catch (error) {
      this.log(`Cannot complete task: ${error.message}`, "error");
      return false;
    }
  }

  async completeTasks(accessToken) {
    const resourceIds = await this.getTaskList(accessToken);
    if (!resourceIds || resourceIds.length === 0) {
      this.log("No uncompleted tasks found", "info");
      return;
    }

    for (const resourceId of resourceIds) {
      if (resourceId !== 2058) {
        const success = await this.completeTask(accessToken, resourceId);
        if (success) {
          this.log(`Completed task: ${resourceId}`, "info");
        } else {
          this.log(`Unable to complete task: ${resourceId}`, "warn");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async playGameIfTicketsAvailable(queryString, accountIndex, firstName, user_id) {
    logger.info(`Account ${accountIndex} | ${firstName}`);

    const result = await this.callBinanceAPI(queryString);
    if (!result) {
      this.log("Failed to get user data", "error");
      return;
    }

    const { userInfo, accessToken } = result;
    this.log(`Received user info: ${JSON.stringify(userInfo)}`, "debug");

    if (!userInfo.metaInfo) {
      this.log("User is not authorized or qualified for the game", "warn");
      return;
    }

    const totalGrade = userInfo.metaInfo.totalGrade ?? 0;
    let totalAttempts = userInfo.metaInfo.totalAttempts ?? 0;
    let consumedAttempts = userInfo.metaInfo.consumedAttempts ?? 0;
    let availableTickets = Math.max(totalAttempts - consumedAttempts, 0);

    this.log(`Total score: ${totalGrade}`, "info");
    this.log(`Current tickets: ${availableTickets}`, "info");

    if (availableTickets <= 0) {
      this.log("No tickets available", "info");
      return;
    }

    await this.completeTasks(accessToken);

    while (availableTickets > 0) {
      this.log(
        `Starting game with ${availableTickets} available tickets`,
        "info"
      );

      if (await this.startGame(accessToken, user_id)) {
        if (await this.getGameData()) {
          await this.countdown(45);
          if (await this.completeGame(accessToken)) {
            availableTickets--;
            this.log(`Tickets remaining: ${availableTickets}`, "info");
          } else {
            this.log("Failed to complete game", "error");
            break;
          }
        } else {
          this.log("Cannot get game data", "error");
          break;
        }
      } else {
        this.log("Cannot start game", "error");
        break;
      }

      if (availableTickets > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (availableTickets === 0) {
      this.log("All tickets have been used", "info");
    }
  }

  async main() {
    // const useProxyInput = prompt(
      // "Do you want to use a proxy? (y/n): "
    // ).toLowerCase();
		const useProxyInput = "n";
    if (useProxyInput === "y") {
      if (!this.proxyConfig.useProxy) {
        logger.warn(
          "Proxy configuration is not set up. Please configure the proxy in config/config.json"
        );
        return;
      }
      logger.info("Using proxy for connections");
    } else {
      this.proxyConfig.useProxy = false;
      logger.info("Not using proxy for connections");
    }

    this.axios = this.createAxiosInstance();

    const dataFile = path.join(__dirname, "data.txt");
    const data = fs
      .readFileSync(dataFile, "utf8")
      .replace(/\r/g, "")
      .split("\n")
      .filter(Boolean);

    while (true) {
      for (let i = 0; i < data.length; i++) {
        const queryString = data[i];
        this.log(`Processing queryString: ${queryString}`, "debug");

        const userData = JSON.parse(
          decodeURIComponent(queryString.split("user=")[1].split("&")[0])
        );
        const user_id = userData.id;
        const firstName = userData.first_name;
        await this.playGameIfTicketsAvailable(queryString, i + 1, firstName, user_id);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      this.log(
        "Finished processing all accounts, waiting for next cycle",
        "info"
      );
      await this.countdown(2400); // Wait for 24 hours before starting the next cycle
    }
  }
}

const client = new Binance();
client.main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
