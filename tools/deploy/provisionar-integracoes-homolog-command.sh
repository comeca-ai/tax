#!/bin/sh
# Root:root 0755, caminho fixo sudoers; authorized_keys aplica comando restrito.
set -eu
test "$#" -eq 0
umask 077
exec /usr/bin/flock --nonblock /etc/reembolsa/.homolog-isolation.lock \
  /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C \
  /usr/bin/node /usr/local/libexec/reembolsa-integracoes-homolog.mjs
