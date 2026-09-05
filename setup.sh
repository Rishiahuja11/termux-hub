#!/data/data/com.termux/files/usr/bin/bash
# Setup admin API: TLS cert + initial admin account
set -e
export PATH=$PREFIX/bin:/data/data/com.termux/files/usr/bin:/usr/bin:$PATH

DIR=~/.termux/adminapi
mkdir -p "$DIR"
cd "$DIR"

# 1) Self-signed TLS cert (10 years)
subject="/CN=admin-local"
if [ ! -s cert.pem ] || [ ! -s key.pem ]; then
  openssl req -x509 -newkey rsa:3072 -nodes \
    -keyout key.pem -out cert.pem -days 3650 \
    -subj "$subject" >/dev/null 2>&1
fi

# 2) Create default admin account if no users exist
if [ ! -s users.json ]; then
  echo '{"admin":{"salt":"'$($PREFIX/bin/head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')'","hash":"placeholder","created":0}}' > users.json
  echo "Created default account: admin / admin"
  echo "(Change this after first login!)"
fi

chmod 600 key.pem cert.pem users.json 2>/dev/null || true

echo "cert=$DIR/cert.pem"
echo "---"
echo "Setup complete. Default account: admin / admin"
