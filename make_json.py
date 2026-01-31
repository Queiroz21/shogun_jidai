import json
import os

ARQUIVO_TXT = "itens.txt"

def carregar_lista(caminho=ARQUIVO_TXT):
    """Carrega a lista do .txt (JSON). Se não existir ou estiver vazio, retorna []"""
    if not os.path.exists(caminho):
        return []

    with open(caminho, "r", encoding="utf-8") as f:
        conteudo = f.read().strip()

    if not conteudo:
        return []

    try:
        dados = json.loads(conteudo)
        if not isinstance(dados, list):
            raise ValueError("O arquivo não contém uma lista JSON.")
        return dados
    except json.JSONDecodeError:
        raise ValueError("O arquivo existe, mas não está em JSON válido.")

def salvar_lista(lista, caminho=ARQUIVO_TXT):
    """Salva a lista inteira no .txt como JSON formatado."""
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(lista, f, indent=2, ensure_ascii=False)

def criar_json():
    item = {}
    item["id"] = input("Digite o id: ").strip()
    item["name"] = input("Digite o nome: ").strip()
    item["parent"] = input("Digite o parent: ").strip()
    item["max"] = int(input("Digite o valor de max (número): ").strip())
    item["icon"] = input("Digite o icon: ").strip()

    print("Digite os requisitos no formato id,lvl (ex: espada,3).")
    print("Quando terminar, digite uma linha vazia e pressione ENTER.")
    item["requires"] = []
    while True:
        entrada = input().strip()
        if entrada == "":
            break
        try:
            req_id, req_lvl = entrada.split(",")
            item["requires"].append({"id": req_id.strip(), "lvl": int(req_lvl.strip())})
        except ValueError:
            print("Formato inválido! Use id,lvl (ex: espada,3).")

    print("Digite a descrição (use ENTER para quebrar linhas).")
    print("Quando terminar, digite uma linha vazia e pressione ENTER.")
    linhas = []
    while True:
        linha = input()
        if linha.strip() == "":
            break
        linhas.append(linha)
    item["desc"] = "\\n".join(linhas)

    return item

def main():
    # 1) Carrega o que já existe no TXT
    try:
        lista = carregar_lista()
    except ValueError as e:
        print(f"Erro ao carregar '{ARQUIVO_TXT}': {e}")
        print("Dica: apague/renomeie o arquivo ou deixe ele como uma lista JSON válida.")
        return

    while True:
        print("\n=== Criar novo item ===")
        novo = criar_json()

        # (opcional) evita IDs duplicados: se existir, atualiza o item
        idx = next((i for i, it in enumerate(lista) if it.get("id") == novo["id"]), None)
        if idx is not None:
            lista[idx] = novo
            print(f"Item com id='{novo['id']}' atualizado.")
        else:
            lista.append(novo)
            print(f"Item com id='{novo['id']}' adicionado.")

        # 2) Salva no TXT a cada item criado/atualizado
        salvar_lista(lista)
        print(f"Salvo em '{ARQUIVO_TXT}' com sucesso.")

        continuar = input("Deseja adicionar outro? (s/n): ").strip().lower()
        if continuar != "s":
            break

    print("\nFinalizado. Arquivo atualizado:", ARQUIVO_TXT)

if __name__ == "__main__":
    main()
