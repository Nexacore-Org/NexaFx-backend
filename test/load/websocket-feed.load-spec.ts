import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  vus: Number(__ENV.K6_VUS || 1000),
  duration: __ENV.K6_DURATION || '30s',
};

const wsURL = __ENV.WS_URL;
const jwt = __ENV.JWT_TOKEN;
const symbols = (__ENV.SYMBOLS || 'EURUSD').split(',');

export default function () {
  if (!wsURL || !jwt) {
    throw new Error('WS_URL and JWT_TOKEN must be provided for the websocket load test.');
  }

  const url = new URL(wsURL);
  url.searchParams.set('access_token', jwt);

  const response = ws.connect(url.toString(), {}, (socket) => {
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'subscribe',
          channel: 'prices',
          symbols,
        }),
      );
    });

    socket.on('message', (message) => {
      const payload = JSON.parse(String(message));
      check(payload, {
        'received a price update payload': (item) =>
          typeof item.symbol === 'string' ||
          typeof item?.data?.symbol === 'string',
      });
    });

    socket.setTimeout(() => {
      socket.close();
    }, 5000);
  });

  check(response, {
    'websocket handshake succeeded': (handshake) => handshake && handshake.status === 101,
  });
}
