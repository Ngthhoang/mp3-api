const express = require('express');
const path = require('path');
const axios = require('axios');
const { ZingMp3 } = require('./dist');

const app = express();
const PORT = process.env.PORT || 5555;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Tolerate accidental double-slash paths from firmware, e.g. //stream_pcm.
app.use((req, _res, next) => {
  const queryIndex = req.url.indexOf('?');
  const rawPath = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
  const rawQuery = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const normalizedPath = rawPath.replace(/\/{2,}/g, '/');
  if (normalizedPath !== rawPath) {
    req.url = `${normalizedPath}${rawQuery}`;
  }
  next();
});

// health
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// basic demos
app.get('/api/top100', async (_req, res) => {
  try {
    const data = await ZingMp3.getTop100();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/home', async (_req, res) => {
  try {
    const data = await ZingMp3.getHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// full list according to README
app.get('/api/song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// redirect to stream URL for simple playback (avoid CORS)
app.get('/api/song/stream', async (req, res) => {
  try {
    const { id, quality = '128' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const response = await ZingMp3.getSong(String(id));
    const url = response?.data?.[String(quality)];
    if (!url || typeof url !== 'string') {
      return res.status(404).json({ error: `Stream URL not found for quality ${quality}` });
    }
    res.redirect(url);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// Proxy stream for firmware clients that cannot follow redirect/TLS upstream.
app.get('/api/song/proxy-stream', async (req, res) => {
  try {
    const { id, quality = '128' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    logRobot('stream_start', { ip: req.ip, id: String(id), quality: String(quality), has_range: Boolean(req.headers.range) });

    const response = await ZingMp3.getSong(String(id));
    const url = response?.data?.[String(quality)];
    if (!url || typeof url !== 'string') {
      return res.status(404).json({ error: `Stream URL not found for quality ${quality}` });
    }

    const requestHeaders = {};
    if (req.headers.range) requestHeaders.Range = req.headers.range;

    const upstream = await axios.get(url, {
      responseType: 'stream',
      headers: requestHeaders,
      validateStatus: () => true,
    });

    const passHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'last-modified',
      'etag',
    ];
    for (const headerName of passHeaders) {
      const value = upstream.headers?.[headerName];
      if (value) res.setHeader(headerName, value);
    }
    res.status(upstream.status);
    upstream.data.pipe(res);
    logRobot('stream_proxying', { ip: req.ip, id: String(id), status: upstream.status });
  } catch (e) {
    logRobot('stream_error', { ip: req.ip, id: String(req.query?.id || ''), error: e?.message || 'Internal Error' });
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/detail-playlist', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getDetailPlaylist(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/chart-home', async (_req, res) => {
  try {
    const data = await ZingMp3.getChartHome();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/newrelease-chart', async (_req, res) => {
  try {
    const data = await ZingMp3.getNewReleaseChart();
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/info-song', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getInfoSong(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const data = await ZingMp3.getArtist(String(name));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/artist-songs', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListArtistSong(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/lyric', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getLyric(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing q' });
    const data = await ZingMp3.search(String(q));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

function emptyRobotPayload() {
  return {
    title: '',
    artist: '',
    audio_url: '',
    lyric_url: '',
    duration: 0,
  };
}

const ROBOT_ENDPOINT = '/stream_pcm';
const ROBOT_ENDPOINT_ALIAS = '/api/robot/music';

function logRobot(event, meta = {}) {
  const ts = new Date().toISOString();
  console.log(`[robot] ${ts} ${event}`, meta);
}

async function resolveRobotSongPayload(req, song, artist = '') {
  if (!song) {
    logRobot('missing_song_query', { ip: req.ip });
    return emptyRobotPayload();
  }

  const query = `${song} ${artist}`.trim();
  logRobot('search_start', { ip: req.ip, song, artist, query });
  const searchResult = await ZingMp3.search(query);
  if (searchResult?.err !== 0) {
    logRobot('search_failed', { ip: req.ip, err: searchResult?.err, msg: searchResult?.msg || '' });
    return emptyRobotPayload();
  }

  const songs = Array.isArray(searchResult?.data?.songs) ? searchResult.data.songs : [];
  if (!songs.length) {
    logRobot('search_empty', { ip: req.ip, query });
    return emptyRobotPayload();
  }

  const normalizedArtist = String(artist || '').trim().toLowerCase();
  const selectedSong = normalizedArtist
    ? (songs.find((item) => String(item?.artistsNames || '').toLowerCase().includes(normalizedArtist)) || songs[0])
    : songs[0];

  const id = selectedSong?.encodeId;
  if (!id) {
    logRobot('song_missing_encode_id', { ip: req.ip, query });
    return emptyRobotPayload();
  }

  const streamPath = `/api/song/proxy-stream?id=${encodeURIComponent(String(id))}`;
  let lyricUrl = '';
  try {
    const lyricResult = await ZingMp3.getLyric(String(id));
    lyricUrl = typeof lyricResult?.data?.file === 'string' ? lyricResult.data.file : '';
  } catch (_e) {
    lyricUrl = '';
  }

  const payload = {
    title: String(selectedSong?.title || ''),
    artist: String(selectedSong?.artistsNames || ''),
    // Firmware currently prefixes base URL, so return relative path to avoid duplicated host.
    audio_url: streamPath,
    lyric_url: lyricUrl,
    duration: Number(selectedSong?.duration || 0),
  };
  logRobot('search_success', { ip: req.ip, id: String(id), title: payload.title, audio_url: payload.audio_url });
  return payload;
}

// Firmware endpoint: always returns exactly 5 keys for robot parser.
app.get(ROBOT_ENDPOINT, async (req, res) => {
  try {
    const { song = '', artist = '' } = req.query;
    logRobot('endpoint_hit', { endpoint: ROBOT_ENDPOINT, ip: req.ip, song: String(song || ''), artist: String(artist || '') });
    const payload = await resolveRobotSongPayload(req, String(song || ''), String(artist || ''));
    res.json(payload);
  } catch (_e) {
    logRobot('endpoint_error', { endpoint: ROBOT_ENDPOINT, ip: req.ip });
    res.json(emptyRobotPayload());
  }
});

app.get(ROBOT_ENDPOINT_ALIAS, async (req, res) => {
  try {
    const { song = '', artist = '' } = req.query;
    logRobot('endpoint_hit', { endpoint: ROBOT_ENDPOINT_ALIAS, ip: req.ip, song: String(song || ''), artist: String(artist || '') });
    const payload = await resolveRobotSongPayload(req, String(song || ''), String(artist || ''));
    res.json(payload);
  } catch (_e) {
    logRobot('endpoint_error', { endpoint: ROBOT_ENDPOINT_ALIAS, ip: req.ip });
    res.json(emptyRobotPayload());
  }
});

app.get('/api/list-mv', async (req, res) => {
  try {
    const { id, page = '1', count = '15' } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getListMV(String(id), String(page), String(count));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/category-mv', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getCategoryMV(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

app.get('/api/video', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const data = await ZingMp3.getVideo(String(id));
    res.json(data);
  } catch (e) {
    res.status(e?.response?.status || 500).json({ error: e?.message || 'Internal Error' });
  }
});

// 0.0.0.0: cho phép máy khác trên cùng LAN (Otto/ESP32) gọi qua IP máy này, không chỉ localhost.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`LAN: other devices use http://<this-computer-LAN-ip>:${PORT}`);
});
