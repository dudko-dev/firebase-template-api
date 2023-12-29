const express = require("express");
const morgan = require("morgan");
const { join } = require("path");
const { createServer } = require("http");
const {
  watch,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} = require("fs");
const { createHash } = require("crypto");
const moment = require("moment-timezone");

const app = express();
const staticDir = join(__dirname, "build");

/**
 * Get all files info
 * @param {string} dir - directory
 */
const getAllFilesInfo = (dir) => {
  const directory = readdirSync(dir, { withFileTypes: true });
  const files = directory.filter((e) => e.isFile());
  const directories = directory.filter((e) => e.isDirectory());
  /**
   * @typedef FileInfo
   * @type {Object}
   * @property {string} path - long path
   * @property {string} short - short path
   * @property {string} hash - sha256 summ of the file
   * @property {moment.Moment} date - date of last edit
   */
  /**
   * @type {Array<FileInfo>}
   */
  const res = directories
    .map((e) => join(dir, e.name))
    .flatMap((e) => getAllFilesInfo(e));
  files.forEach((e) => {
    const origPath = join(dir, e.name);
    const shortPath = origPath.replace(staticDir, "");
    const hash = createHash("sha256");
    hash.write(readFileSync(origPath));
    const hashDigest = hash.digest("hex");
    const stat = statSync(origPath);
    const modData = moment(stat.mtimeMs);
    res.push({
      path: origPath,
      short: shortPath,
      hash: hashDigest,
      date: modData,
    });
  });
  return res;
};

/**
 *
 * @param {string} dir - directory with static files
 * @param {string} host - host name
 * @param {Array<RegExp>} ignore - ignored files
 */
const prepareFileData = (dir, host, ignore) => {
  const filesInfo = getAllFilesInfo(dir);
  /**
   * @typedef FilesMap
   * @type {Object}
   * @property {string} url - short path
   * @property {string} hash - sha256 summ of the file
   * @property {string} date - date of last edit
   */
  /**
   * @type {Object<string, FilesMap>}
   */
  const res = filesInfo
    .sort((a, b) => (a.path >= b.path ? -1 : 1))
    .reduce((pre, e) => {
      if (ignore.findIndex((t) => t.test(e.short)) === -1) {
        pre[e.path] = {
          url: `${host}${e.short}`,
          hash: e.hash,
          date: e.date.format("YYYY-MM-DD"),
        };
      }
      return pre;
    }, {});
  return res;
};

/**
 * Write sitemap data
 * @param {Object<string, FilesMap>} base - sitemap base
 */
const writeSiteMap = (base) => {
  const filePath = join(staticDir, "sitemap.xml");
  let fileData = '<?xml version="1.0" encoding="UTF-8"?>\n';
  fileData += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  Object.values(base).forEach((e) => {
    fileData += "\t<url>\n";
    fileData += `\t\t<loc>${e.url}</loc>\n`;
    fileData += `\t\t<lastmod>${e.date}</lastmod>\n`;
    fileData += "\t</url>\n";
  });
  fileData += "</urlset>";
  writeFileSync(filePath, fileData);
};

process.once("SIGINT", () => {
  const siteMapBase = prepareFileData(
    staticDir,
    "https://ad.miniaccountant.app",
    [/\.DS_Store$/i, /^\/sitemap.xml$/]
  );
  writeSiteMap(siteMapBase);
  process.exit(0);
});

app.use(
  morgan(
    ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  )
);
app.use(
  express.static(staticDir, {
    etag: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache");
    },
  })
);
createServer({}, app).listen(80);
