import { fileURLToPath } from "url";
import { ALARM, PROXIES, PROXY_LIST, OPEN_URL, USER_AGENTS } from "../main.js";
import threeBeeps from "../utils/notification/beep.js";
import sendAlerts from "../utils/notification/alerts.js";
import writeErrorToFile from "../utils/log-error.js";
import open from "open";
import axios from "axios";
import moment from "moment";
import DomParser from "dom-parser"; // https://www.npmjs.com/package/dom-parser
import HttpsProxyAgent from "https-proxy-agent";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	let interval = {
		unit: "seconds", // seconds, m: minutes, h: hours
		value: 5,
	};
	let url = "https://www.newegg.com/p/N82E16868110292";
	newegg(url, interval);
}

const store = "Newegg";
let urlOpened = false;
let firstRun = new Set();
let badProxies = new Set();
export default async function newegg(url, interval) {
	let res = undefined,
		html = undefined,
		proxy = undefined;

	try {
		let options = undefined;

		// Setup proxies
		if (PROXIES && PROXY_LIST.length > 0) {
			if (badProxies.size == PROXY_LIST.length)
				// If all proxies are used, start over
				badProxies = new Set();

			do {
				proxy = "http://" + PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
			} while (badProxies.has(proxy));

			let agent = new HttpsProxyAgent(proxy);
			options = {
				httpsAgent: agent,
				headers: {
					"User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
				},
			};
		} else
			options = {
				headers: { "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] },
			};

		// Get Page
		res = await axios.get(url, options).catch(async function (error) {
			writeErrorToFile(store, error);
		});

		// Extract Information
		if (res && res.status == 200) {
			html = res.data;

			// If bot Detected
			if (html.includes("Are you a human?")) {
				let message = moment().format("LTS") + ": " + store + " bot detected. ";
				if (PROXIES) message += "NEWEGG RATE LIMIT ON: " + url + ". PROXY: " + proxy;
				else message += "Consider using proxies or lowering interval.";
				console.error(message);
				badProxies.add(proxy);
				return;
			}

			let parser = new DomParser();
			let doc, title, inventory, image;

			// Check combo product
			if (url.includes("ComboDealDetails")) {
				doc = parser.parseFromString(html, "text/html");
				title = doc.getElementsByTagName("title")[0].textContent;
				inventory = doc.getElementsByClassName("atnPrimary");
				image = "https:" + doc.getElementById("mainSlide_0").getAttribute("src");
			} else {
				// Check normal product
				doc = parser.parseFromString(html, "text/html");
				title = doc.getElementsByClassName("product-title")[0].innerHTML.trim().slice(0, 150);
				inventory = doc.getElementsByClassName("btn btn-primary btn-wide");
				image = doc.getElementsByClassName("image_url");
				if (image.length > 0) image = image[0].textContent;
			}

			if (inventory.length > 0) {
				inventory = inventory[0].firstChild.textContent;
				inventory = inventory.toLowerCase();
			}

			if ((!inventory || inventory != "add to cart ") && !firstRun.has(url)) {
				console.info(
					moment().format("LTS") +
						': "' +
						title +
						'" not in stock at ' +
						store +
						"." +
						" Will keep retrying in background every",
					interval.value,
					interval.unit
				);
				firstRun.add(url);
			} else if (inventory && inventory == "add to cart ") {
				if (ALARM) threeBeeps();
				if (!urlOpened) {
					if (OPEN_URL) open(url);
					sendAlerts(url, title, image, store);
					urlOpened = true;
					setTimeout(() => (urlOpened = false), 1000 * 295); // Open URL and send alerts every 5 minutes
				}
				console.info(moment().format("LTS") + ": ***** In Stock at " + store + " *****: ", title);
				console.info(url);
			}
		}
	} catch (error) {
		writeErrorToFile(store, error, html, res.status);
	}
}
