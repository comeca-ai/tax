#!/bin/sh
# Instalação root:root 0755, fora do checkout. Único comando permitido no sudoers.
set -eu
test "$#" -eq 0
umask 077
exec /usr/bin/flock --nonblock /etc/reembolsa/whatsapp-homolog/apply.lock \
  /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C \
  /usr/bin/node /usr/local/libexec/reembolsa-whatsapp-homolog.mjs
