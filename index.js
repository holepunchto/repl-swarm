const DHT = require('hyperdht')
const sodium = require('sodium-universal')
const repl = require('repl')
const os = require('os')
const path = require('path')

module.exports = function replSwarm ({ seed, logSeed=true, ...context } = {}) {
  const node = new DHT({ ephemeral: true })

  if (!seed) seed = process.env.REPL_SWARM || randomBytes(32)
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')

  const keyPair = DHT.keyPair(seed)

  const tmp = path.join(os.tmpdir(), 'repl-swarm-' + keyPair.publicKey.toString('hex'))

  const server = node.createServer({ firewall }, function (socket) {
    console.error('[repl-swarm] Attaching repl session')

    socket.setTimeout(30000)
    socket.setKeepAlive(20000)

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

    socket.on('end', () => socket.end())
    socket.on('error', () => socket.destroy())
    socket.on('close', function () {
      console.error('[repl-swarm] Session closed')
    })
  })

  server.listen(keyPair)

  const hexSeed = seed.toString('hex')
  if (logSeed) console.error('[repl-swarm] Repl attached. To connect to it run:\n             repl-swarm ' + hexSeed)

  function firewall (remotePublicKey) {
    return !remotePublicKey.equals(keyPair.publicKey)
  }

  return hexSeed
}

module.exports.attach = function (seed) {
  if (!seed) seed = process.env.REPL_SWARM
  if (typeof seed === 'string') seed = Buffer.from(seed, 'hex')
  if (!seed) throw new Error('Seed is required')

  const node = new DHT({ ephemeral: true })
  const keyPair = DHT.keyPair(seed)

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

function randomBytes (length) {
  const buffer = Buffer.alloc(length)
  sodium.randombytes_buf(buffer)
  return buffer
}
