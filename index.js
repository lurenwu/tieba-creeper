"use strict";
/**
 * 
 * 百度贴吧帖子图片批量下载爬虫
 * https://github.com/hhui64/tieba-plus-plus
 * 
 * 用法: node index.js <threadUrl> <user>
 * 例子: node index.js https://tieba.baidu.com/p/6008413968 萌嘛香
 * 
 * @threadUrl: 帖子的链接地址, 后面不带任何多余参数
 * @user: 只爬指定用户的帖子楼层, 判断优先级为 user_id -> user_name -> usernickname, 留空默认全都爬
 * 
 */
const express = require('express');
const request = require('request');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const colors = require('colors');
const log = require('single-line-log').stdout;

const app = express();

app.get('/', (req, res) => {
  res.send('tieba++');
});

var defaultThreadUrl = ''; // 没有参数时的默认帖子链接 
var defaultOnlyLookHeUser = ''; 

var threadUrl = process.argv[2] ? process.argv[2] : defaultThreadUrl;
var threadInfo = {
  threadId: (() => {
    return threadUrl.slice(threadUrl.indexOf('https') != -1 ? 26 : 25, threadUrl.length);
  })(),
  authorInfo: {
    user_id: '',
    user_name: '',
    user_nickname: ''
  },
  onlyLookHe: {
    user_id: '',
    user_name: '',
    user_nickname: '',
    user: process.argv[3] ? process.argv[3] : defaultOnlyLookHeUser
  },
  threadContent: {
    html: [],
    title: null,
    page: 0,
    total: 0,
    postList: {
      html: [],
      element: []
    }
  }
}

if (!threadUrl) {
  console.log(colors.bold.red('没有指定帖子链接, 您是想下载空气吗？qwq'));
  return;
}

console.log(colors.bgGreen.black(' DONE ') + (' 配置初始化完成! 正在获取帖子信息中, 请稍后...').green);
console.log(colors.bgYellow.black(' INFO ') + (' 帖子链接 ➤ ' + threadUrl).yellow);

request(threadUrl, async (error, response, body) => {
  if (!error && response.statusCode == 200) {
    let $ = cheerio.load(body);
    let pageInfoText = $('.l_reply_num').text();
    let authorInfoData = $('.l_post_bright').eq(0).data('field');
    threadInfo.authorInfo.user_id = authorInfoData.author.user_id;
    threadInfo.authorInfo.user_name = authorInfoData.author.user_name;
    threadInfo.authorInfo.user_nickname = authorInfoData.author.user_nickname;
    threadInfo.threadContent.title = $('.core_title_txt').text();
    threadInfo.threadContent.page = pageInfoText.slice(pageInfoText.indexOf('回复贴，共') + 5, pageInfoText.indexOf('页'));
    console.log(colors.bgYellow.black(' INFO ') + (' 帖子标题 ➤ ' + threadInfo.threadContent.title).yellow);
    console.log(colors.bgYellow.black(' INFO ') + (' 帖子作者 ➤ ' + (threadInfo.authorInfo.user_id + ' · ' + threadInfo.authorInfo.user_name + ' · ' + threadInfo.authorInfo.user_nickname)).yellow);
    console.log(colors.bgGreen.black(' DONE ') + (' 获取帖子信息完成! 正在扫描所有页面中, 请稍后...').green);
    //let pageCount = 0;
    for (let i = 0; i < Number(threadInfo.threadContent.page); i++) {
      let nowPageUrl = threadUrl + '?pn=' + (i + 1).toString();
      let nowPageHtml = await requestPageHtmlAsync(nowPageUrl); // 同步request当前page
      threadInfo.threadContent.html.push(nowPageHtml);
      if (threadInfo.threadContent.html[i]) {
        let nowPostHtml = await eachPostAsync(threadInfo.threadContent.html[i]); // 遍历帖子内容
        threadInfo.threadContent.postList.html = threadInfo.threadContent.postList.html.concat(nowPostHtml);
        log(colors.bgGreen.black(' DONE ') + (' 扫描所有页面完成! 正在扫描所有页面的帖子中, 请稍后... （共' + threadInfo.threadContent.page + '页，正在扫描第' + (i + 1) + '页）').green + '\n');
      }
      if (i + 1 == Number(threadInfo.threadContent.page)) {
        threadInfo.threadContent.total = threadInfo.threadContent.postList.html.length;
        console.log(colors.bgGreen.black(' DONE ') + (' 扫描所有帖子完成! 正在进一步处理中, 请稍后... （共' + threadInfo.threadContent.total + '个帖子）').green);
        analysisPost();
      }
    }
  } else {
    console.log('请求失败: ' + error);
  }
});

function requestPageHtmlAsync (nowPageUrl) {
  return new Promise((resolve, reject) => {
    request(nowPageUrl, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        resolve(body);
      } else {
        reject(error);
      }
    })
  });
}

function eachPostAsync (nowPageHtml) {
  return new Promise((resolve, reject) => {
    let $_nowPage = cheerio.load(nowPageHtml);
    let postHtmlArray = [];
    let postCount = 0;
    $_nowPage('.l_post_bright').each(async function (index, element) {
      postCount++;
      let content = $_nowPage(this).data('field');
      if (!content) return;
      if (!content.content) content.content = {};
      if (!content.content.content) content.content.content = $_nowPage(this).find('.p_content').html();
      postHtmlArray.push(content);
      if (postCount >= $_nowPage('.l_post_bright').length) {
        resolve(postHtmlArray);
      }
    });
  });
}

function eachPostImageAsync(nowPageImageHtml) {
  return new Promise((resolve, reject) => {
    let $_nowPost = cheerio.load(nowPageImageHtml);
    let postImageArray = [];
    let postImageCount = 0;
    if ($_nowPost('img.BDE_Image').length > 0) {
      $_nowPost('img.BDE_Image').each(function (i, e) {
        postImageCount++;
        postImageArray.push($_nowPost(this).attr('src'));
        if (postImageCount >= $_nowPost('img.BDE_Image').length) {
          resolve(postImageArray);
        }
      });
    } else {
      resolve('no image');
    }
  });
}

var analysisPost = async () => {
  let imgUrlArray = [];
  for (let i = 0; i < Number(threadInfo.threadContent.total); i++) {
    let postDataField = threadInfo.threadContent.postList.html[i];
    if (!postDataField.author) continue
    if (!threadInfo.onlyLookHe.user) { // 判断只看某个作者的帖子
      if (threadInfo.onlyLookHe.user == postDataField.author.user_id) {
        continue;
      } else if (threadInfo.onlyLookHe.user == postDataField.author.user_name) {
        continue;
      } else if (threadInfo.onlyLookHe.user == postDataField.author.user_nickname) {
        continue;
      } else {
        // 以前我没得选, 现在我全都要
      }
    }
    let eachImageArray = await eachPostImageAsync(postDataField.content.content); // 解析帖子内的image
    if (eachImageArray == 'no image') continue;
    imgUrlArray = imgUrlArray.concat(eachImageArray);
  }
  console.log(colors.bgGreen.black(' DONE ') + (' 扫描帖子图片完成! 正准备下载到本地中, 请稍后... （共' + imgUrlArray.length + '张图片）').green);
  downloadImage(imgUrlArray);
}

var downloadImage = async (imageUrlArray) => {
  let fileFolderName = '/files/thread_' + threadInfo.threadId;
  let fileFolderPath = path.join(__dirname, fileFolderName);
  let fileCount = {
    success: 0,
    error: 0
  }
  if (!fs.existsSync(__dirname + '/files')) fs.mkdirSync(__dirname + '/files');
  if (!fs.existsSync(fileFolderPath)) fs.mkdirSync(fileFolderPath);
  console.log(colors.bgYellow.black(' INFO ') + (' 储存目录 ➤ ' + fileFolderPath).yellow + '\n');
  for (let i = 0; i < imageUrlArray.length; i++) {
    let bigImageUrl = 'https://imgsrc.baidu.com/forum/pic/item/' + imageUrlArray[i].slice(imageUrlArray[i].indexOf('sign=') + 5 + 33, imageUrlArray[i].length);
    let imageData = await downloadImageAsync(bigImageUrl, fileFolderPath, i, imageUrlArray.length);
    if (imageData != 'download error') {
      fileCount.success++;
    } else {
      fileCount.error++;
    }
    if (i == imageUrlArray.length - 1) log(colors.bgGreen.black(' DONE ') + (' 所有图片下载完毕! （成功' + fileCount.success + '张，失败' + fileCount.error + '张）').green + '\n');
  }
}

function downloadImageAsync(imageUrl, fileFolderPath, imageCount, imageTotalCount) {
  let fileName = imageUrl.slice(imageUrl.indexOf('sign=') + 5 + 36, imageUrl.length);
  let fileTotalSize = 0,
      fileDownloadSize = 0,
      // fileDownloadSpeed = 0,
      fileData = null,
      fileBodyData = null;
  return new Promise((resolve, reject) => {
    request({
      url: imageUrl,
      encoding: null
    }, (error, response, body) => {
      if (!error) {
        fileBodyData = body;
        let filePath = path.join(fileFolderPath, '/' + fileName);
        fs.writeFile(filePath, fileBodyData, 'binary', error => { }); // 写文件
      } else {
        // catch error
      }
    })
    .on('response', data => { // 响应请求
      fileTotalSize = parseInt(data.headers['content-length'], 10);
    })
    .on('data', chunk => {
      fileData += chunk;
      fileDownloadSize += chunk.length;
      // fileDownloadSpeed = chunk.length;
      let size = (() => {
        return Math.round(fileTotalSize / 1024) >= 1024 ? (fileTotalSize / 1024 / 1024).toFixed(1) + ' MB' : Math.round(fileTotalSize / 1024) + ' KB';
      })();
      let progress = Math.floor(100 * fileDownloadSize / fileTotalSize);
      log(((imageCount + 1) + '/' + imageTotalCount).blue + '  ' + colors.cyan.bold(fileName) + '  ' + (fileTotalSize ? (size) : '').gray + '  ' + (progress == 100 ? '下载完成'.green : ('下载中... ' + progress + '%').yellow) + '\n');
    })
    .on('end', () => {
      console.log('');
      resolve({
        fileData: fileData,
        fileBodyData: fileBodyData
      });
    })
    .on('error', (error) => {
      console.log(((imageCount + 1) + '/' + imageTotalCount).blue + '  ' + colors.cyan.bold(fileName) + '  ' + (fileTotalSize ? (size) : '').gray + '  ' + '下载失败'.red);
      resolve('download error');
    });
  });
}