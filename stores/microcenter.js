import { fileURLToPath } from "url";
import { ALARM, PROXIES, PROXY_LIST, OPEN_URL, USER_AGENTS } from "../main.js";
import threeBeeps from "../utils/notification/beep.js";
import sendAlerts from "../utils/notification/alerts.js";
import writeErrorToFile from "../utils/log-error.js";
import open from "open";
import axios from "axios";
import moment from "moment";
import DomParser from "dom-parser"; // https://www.npmjs.com/package/dom-parser
import console from "console";
import HttpsProxyAgent from "https-proxy-agent";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	let interval = {
		unit: "seconds", // seconds, m: minutes, h: hours
		value: 5,
	};
	let url =
		"https://www.microcenter.com/product/613412/pny-quadro-rtx-4000-single-fan-8gb-gddr6-pcie-30-graphics-card";
	microcenter(url, interval);
}

const store = "Microcenter";
let firstRun = new Set();
let urlOpened = false;
export default async function microcenter(url, interval) {
	let response = undefined,
		html = undefined,
		proxy = undefined;

	let productID = url.match(/(?<=product\/).*(?=\/)/i)[0];

	try {
		let options = undefined;

		// Setup proxies
		if (PROXIES && PROXY_LIST.length > 0) {
			proxy = "http://" + PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
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
		response = await axios.get(url, options).catch(async function (error) {
			writeErrorToFile(store, error);
		});

		// Extract Information
		if (response && response.status == 200) {
			html = response.data;

			let parser = new DomParser();
			let document = parser.parseFromString(html, "text/html");
			let title = document.getElementsByClassName("ProductLink_" + productID);
			let image = document
				.getElementsByTagName("meta")
				.find((meta) => meta.getAttribute("property") == "og:image")
				.getAttribute("content");

			if (title.length > 0) title = title[0].textContent.trim().slice(0, 150);

			if (!html.includes("in stock") && !firstRun.has(url)) {
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
			} else if (html.includes("in stock")) {
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
		writeErrorToFile(store, error, html, response.status);
	}
}
