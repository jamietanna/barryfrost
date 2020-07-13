const arc = require('@architect/functions')
const fetch = require('node-fetch')
const nunjucks = require('nunjucks')

const md = require('markdown-it')({
  linkify: true,
  html: true
})

nunjucks.configure('views')

const micropubSourceUrl = `${process.env.MICROPUB_URL}?q=source`

const staticPath = arc.static('/')

function flatten (post) {
  for (const key in post) {
    if (Array.isArray(post[key]) && post[key].length === 1) {
      post[key] = post[key][0]
    }
  }
}

function humanDate (dateString) {
  return new Date(dateString).toLocaleString('default', { 
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

async function getIndex () {
}

async function getPostType (postType) {
  const response = await fetch(
    `${micropubSourceUrl}&post-type=${postType}`,
    { headers: { Authorization: `Bearer ${process.env.MICROPUB_TOKEN}` } }
  )
  console.log(JSON.stringify(response))
  if (!response.ok) return
  const json = await response.json()
  console.log(json)
  const posts = json.map(item => {
    const post = { ...item }
    flatten(post)
    post.contentHtml = md.render(post.content)
    post.publishedHuman = humanDate(post.published)
    return post
  })
  const html = nunjucks.render('notes.njk', { posts, staticPath })
  return html
}

async function getPost (slug) {
  const response = await fetch(
    `${micropubSourceUrl}&url=${process.env.ROOT_URL}${slug}`,
    { headers: { Authorization: `Bearer ${process.env.MICROPUB_TOKEN}` } }
  )
  console.log(JSON.stringify(response))
  if (!response.ok) return
  const json = await response.json()
  // console.log(json)
  const post = { ...json.properties }
  flatten(post)
  post.contentHtml = md.render(post.content)
  post.publishedHuman = humanDate(post.published)
  console.log(JSON.stringify(post))
  // if ('post-status' in post && post['post-status'] === 'draft') return
  // don't show private posts
  if ('visibility' in post && post.visibility === 'private') return
  const postJSON = JSON.stringify(post, null, 2)
  const html = nunjucks.render('note.njk', { post, staticPath, postJSON })
  return html
}

exports.handler = async function http (req) {
  // accepted post types from server
  const postTypes = ['notes', 'articles', 'bookmarks', 'photos', 'checkins',
    'reposts', 'likes', 'replies']
  // strip initial slash, remove any api gateway stage, clean characters
  const url = req.path.substr(1).replace(/^staging\//, '')
    .replace(/[^a-z0-9/-]/, '')
  const res = {
    headers: { 'content-type': 'text/html; charset=utf8' }
  }
  console.log(`url=${url}`)
  // temp reject favicon
  if (url === 'faviconico') {
    return { statusCode: 404 }
  // post types e.g. notes (no trailing slash)
  } else if (postTypes.includes(url)) {
    let postType = url.substr(0, url.length - 1)
    if (postType === 'replie') postType = 'reply'
    return { ...res, body: await getPostType(postType) }
  // root is homepage
  } else if (url === '') {
    return { ...res, body: await getIndex() }
  // default, assume a post
  } else {
    const body = await getPost(url)
    if (body) {
      return { ...res, body }
    } else {
      return { statusCode: 404 }
    }
  }
}
