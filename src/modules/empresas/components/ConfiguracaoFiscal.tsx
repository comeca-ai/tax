import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";

export default function ConfiguracaoFiscal({
  empresaId,
}: {
  empresaId: number;
}) {
  const utils = trpc.useUtils();
  const config = trpc.fiscal.configuracao.useQuery(
    { empresaId },
    { retry: false }
  );
  const alterar = trpc.fiscal.configurar.useMutation({
    onSuccess: async (_result, input) => {
      await utils.fiscal.configuracao.invalidate({
        empresaId: input.empresaId,
      });
      toast.success(
        input.habilitada
          ? "Verificação fiscal solicitada para novas despesas"
          : "Verificação fiscal desativada"
      );
    },
    onError: async () => {
      await utils.fiscal.configuracao.invalidate({ empresaId });
    },
  });
  return (
    <section
      className="rounded-xl border border-line bg-surface p-5 shadow-card"
      aria-labelledby={`fiscal-${empresaId}`}
    >
      <h2
        id={`fiscal-${empresaId}`}
        className="flex items-center gap-2 text-sm font-semibold text-text-900"
      >
        <ShieldCheck className="h-5 w-5" /> Verificação fiscal
      </h2>
      {config.isLoading && (
        <p className="mt-3 text-sm text-text-500">
          Carregando opção da empresa…
        </p>
      )}
      {config.isError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Não foi possível carregar a opção fiscal. Tente novamente.
        </p>
      )}
      {config.data && (
        <>
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-text-900">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-brand-500"
              checked={config.data.habilitada}
              disabled={!config.data.podeAlterar || alterar.isPending}
              onChange={event =>
                alterar.mutate({
                  empresaId,
                  habilitada: event.target.checked,
                  versaoEsperada: config.data!.versao,
                })
              }
            />
            <span>Verificar autenticidade fiscal da nota</span>
          </label>
          <p className="mt-3 text-sm text-text-500">
            {config.data.habilitada
              ? "Ativada para esta empresa."
              : "Desativada para esta empresa."}{" "}
            Nas novas despesas enviadas pelo painel ou WhatsApp, a consulta
            ocorre após a leitura da nota e antes da decisão de reembolso.
          </p>
          <p className="mt-2 text-sm text-text-500">
            Cobertura atual: NF-e modelo 55 com chave legível. NFC-e modelo 65
            aparece como não suportada. Sem confirmação fiscal, a despesa segue
            para revisão. Uma nota autorizada continua sujeita à política de
            reembolso.
          </p>
          <p className="mt-2 text-xs text-text-500">
            As consultas usam o saldo autorizado da integração. Ativar a opção
            não compra créditos. No WhatsApp, a confirmação de recebimento segue
            independente desta análise.
          </p>
          {!config.data.podeAlterar && (
            <p className="mt-3 text-xs text-text-500">
              A alteração é exclusiva do administrador da empresa.
            </p>
          )}
          {config.data.alteradaEm && (
            <p className="mt-3 text-xs text-text-500">
              Última alteração:{" "}
              {new Date(config.data.alteradaEm).toLocaleString("pt-BR")}. Versão{" "}
              {config.data.versao}; autoria registrada no histórico.
            </p>
          )}
          {alterar.isError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {alterar.error.message}
            </p>
          )}
          {config.data.historico.length > 0 && (
            <details className="mt-3 text-xs text-text-500">
              <summary className="cursor-pointer">
                Histórico de alterações
              </summary>
              <ul className="mt-2 space-y-1">
                {config.data.historico.map((item, index) => (
                  <li key={`${String(item.em)}-${index}`}>
                    {new Date(item.em).toLocaleString("pt-BR")} · usuário{" "}
                    {item.usuarioId}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
