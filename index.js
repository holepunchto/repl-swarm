const DHT = require('hyperdht')
const sodium = require('sodium-universal')
const repl = require('repl')
const os = require('os')
const path = require('path')
const net = require('net')
const process = require('process')

module.exports = function replSwarm ({ seed, devtools, ...context } = {}) {
  const node = new DHT({ ephemeral: true })

  if (!seed) seed = process.env.REPL_SWARM || randomBytes(32)
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')

  const keyPair = DHT.keyPair(seed)

  const server = node.createServer({ firewall, reusableSocket: true }, function (socket) {
    if (devtools) {
      listenDevtools(socket, context)
    } else {
      listenRepl(seed, keyPair, socket, context)
    }
  })
  server.listen(keyPair)

  const hexSeed = seed.toString('hex')
  if (devtools) {
    console.error('[repl-swarm] Listening for devtools. To connect to it run:\n             repl-swarm ' + hexSeed + ' --devtools\n')
    console.error('             Then open Chrome devtools and connect to the Node process')
  } else {
    console.error('[repl-swarm] Repl attached. To connect to it run:\n             repl-swarm ' + hexSeed)
  }

  function firewall (remotePublicKey) {
    return !remotePublicKey.equals(keyPair.publicKey)
  }

  return hexSeed
}

module.exports.attach = function (seed, { devtools = false } = {}) {
  if (!seed) seed = process.env.REPL_SWARM
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')
  if (!seed) throw new Error('Seed is required')

  const node = new DHT({ ephemeral: true })
  const keyPair = DHT.keyPair(seed)

  if (devtools) {
    attachDevtools(node, keyPair)
  } else {
    attachRepl(node, keyPair)
  }
}

function listenRepl (seed, keyPair, socket, context) {
  socket.on('end', () => socket.end())
  socket.on('error', (err) => { console.log('err:', err); socket.destroy() })
  socket.on('close', function () {
    console.error('[repl-swarm] Session closed')
  })

  const tmp = path.join(os.tmpdir(), 'repl-swarm-' + keyPair.publicKey.toString('hex'))
  const prompt = '[' + seed.subarray(0, 4).toString('hex') + ']> '

  const r = repl.start({
    useColors: true,
    prompt,
    input: socket,
    output: socket,
    terminal: true,
    preview: false
  })

  r.on('exit', function () {
    socket.end()
  })

  r.on('error', function () {
    socket.destroy()
  })

  r.setupHistory(tmp, () => {})

  for (const key of Object.keys(context)) {
    r.context[key] = context[key]
  }
}

function attachRepl (node, keyPair) {
  const socket = node.connect(keyPair.publicKey, { keyPair })
  socket.setTimeout(30000)
  socket.setKeepAlive(20000)

  socket.pipe(process.stdout)

  socket.on('end', () => socket.end())
  socket.once('data', function () {
    process.stdin.setRawMode(true)
    process.stdin.pipe(socket)
    process.stdin.on('data', function (data) {
      if (data.length === 0 && data[0] === 0x03) process.exit(0)
    })
  })

  socket.on('error', function (err) {
    console.error(err.stack)
    process.exit(1)
  })

  socket.on('close', function () {
    process.exit()
  })
}

function listenDevtools (socket, context) {
  global.context = context
  process.kill(process.pid, 'SIGUSR1')

  const tcp = net.connect(9229, '127.0.0.1', onconnect)

  function onconnect () {
    socket.pipe(tcp).pipe(socket)
    socket.on('close', () => tcp.destroy())
    tcp.on('close', () => socket.destroy())
    socket.on('error', noop)
    tcp.on('error', noop)
  }
}

function attachDevtools (node, keyPair) {
  const server = net.createServer(onconnection)

  server.listen(9229)
  console.log('Open devtools to connect...')

  function onconnection (tcp) {
    const socket = node.connect(keyPair.publicKey, { keyPair })
    socket.setTimeout(30000)
    socket.setKeepAlive(20000)

    socket.pipe(tcp).pipe(socket)

    socket.on('close', () => tcp.destroy())
    tcp.on('close', () => socket.destroy())
    socket.on('error', noop)
    tcp.on('error', noop)
  }
}

function randomBytes (length) {
  const buffer = Buffer.alloc(length)
  sodium.randombytes_buf(buffer)
  return buffer
}

function noop () {}
