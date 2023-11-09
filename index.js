const DHT = require('hyperdht')
const sodium = require('sodium-universal')
const crypto = require('hypercore-crypto')
const repl = require('repl')
const os = require('os')
const path = require('path')
const net = require('net')
const process = require('process')
const inspector = require('inspector')

const DEVTOOLS_PORT = +process.env.DEVTOOLS_PORT

module.exports = function replSwarm ({ seed, devtools, ...context } = {}) {
  const node = new DHT({ ephemeral: true })

  if (!seed) seed = process.env.REPL_SWARM || randomBytes(32)
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')

  const keyPairs = createKeyPairs(seed)

  const replServer = node.createServer({
    firewall: firewall(keyPairs.repl),
    reusableSocket: true
  }, handleReplConnection)
  const devtoolsServer = node.createServer({
    firewall: firewall(keyPairs.devtools),
    reusableSocket: true
  }, handleDevtoolsConnection)

  replServer.listen(keyPairs.repl)
  devtoolsServer.listen(keyPairs.devtools)

  const hexSeed = seed.toString('hex')
  console.error('[repl-swarm] Repl attached. To connect to it run:\n             repl-swarm ' + hexSeed)

  function firewall (keyPair) {
    return (remotePublicKey) => !remotePublicKey.equals(keyPair.publicKey)
  }

  return hexSeed

  function handleReplConnection (socket) {
    socket.setTimeout(30000)
    socket.setKeepAlive(20000)
    socket.on('end', () => socket.end())
    socket.on('error', (err) => { console.log('err:', err); socket.destroy() })
    socket.on('close', function () {
      console.error('[repl-swarm] Session closed')
    })

    const tmp = path.join(os.tmpdir(), 'repl-swarm-' + keyPairs.repl.publicKey.toString('hex'))
    const prompt = '[' + seed.subarray(0, 4).toString('hex') + ']> '

    const r = repl.start({
      useColors: true,
      prompt,
      input: socket,
      output: socket,
      terminal: true,
      preview: false
    })
    r.context.enableDevtools = (pid = process.pid) => {
      global.context = context
      if (pid !== process.pid) {
        process.kill(pid, 'SIGUSR1')
      } else {
        inspector.open(DEVTOOLS_PORT || 9229, '127.0.0.1')
      }
      r.output.write('[repl-swarm] Listening for devtools. To connect to it run:\n             repl-swarm ' + hexSeed + ' --devtools\n')
      r.output.write('             Then open Chrome Devtools and connect to the Node process\n')
    }

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

  function handleDevtoolsConnection (socket) {
    socket.setTimeout(30000)
    socket.setKeepAlive(20000)

    const tcp = net.connect(DEVTOOLS_PORT || 9229, '127.0.0.1', () => {
      socket.pipe(tcp).pipe(socket)
      socket.on('close', () => tcp.destroy())
      tcp.on('close', () => socket.destroy())
      socket.on('error', noop)
      tcp.on('error', noop)
    })
  }
}

module.exports.attach = function (seed, { devtools = false } = {}) {
  if (!seed) seed = process.env.REPL_SWARM
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')
  if (!seed) throw new Error('Seed is required')

  const node = new DHT({ ephemeral: true })

  const keyPairs = createKeyPairs(seed)

  if (devtools) {
    attachDevtools(node, keyPairs.devtools)
  } else {
    attachRepl(node, keyPairs.repl)
  }
}

function attachRepl (node, keyPair) {
  const socket = node.connect(keyPair.publicKey, { reusableSocket: true, keyPair })
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

function attachDevtools (node, keyPair) {
  const server = net.createServer(tcp => {
    const socket = node.connect(keyPair.publicKey, { reusableSocket: true, keyPair })
    socket.setTimeout(30000)
    socket.setKeepAlive(20000)

    socket.pipe(tcp).pipe(socket)

    socket.on('close', () => tcp.destroy())
    tcp.on('close', () => socket.destroy())
    socket.on('error', noop)
    tcp.on('error', noop)
  })

  server.listen(9229, '127.0.0.1')
  server.on('listening', () => {
    const addr = server.address()
    console.log(`Devtools server listening on ${addr.address}:${addr.port}...`)
  })
}

function createKeyPairs (seed) {
  const replSeed = seed
  const devtoolsSeed = crypto.hash(seed)

  return {
    repl: DHT.keyPair(replSeed),
    devtools: DHT.keyPair(devtoolsSeed)
  }
}

function randomBytes (length) {
  const buffer = Buffer.alloc(length)
  sodium.randombytes_buf(buffer)
  return buffer
}

function noop () {}
