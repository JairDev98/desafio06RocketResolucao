import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

// CSV PARSE LIB PARA MANIPULAR ARQUIVO .CSV
class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      // começar a leitura do arquivo pela linha 2
      from_line: 2,
    });

    // efetua leitura de linhas conforme elas estão disponíveis
    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;
      // EFETUANDO REGISTRO PARA NÃO FICAR ABRINDO E FECHANDO O BANCO DE DADOS VARIAS VEZES
      // SERÁ ENVIADO UM ARQUIVO COM TODOS OS DADOS DE UMA SÓ VEZ

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    // quando o parseCSV emitir o evento end, ele vai retornar o resultado de parseCSV
    await new Promise(resolve => parseCSV.on('end', resolve));

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    // verificando as categorias que já estão cadastradas
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // removendo do addCategoryTitles as categorias que já estão cadastradas no banco de dados
    // fazendo removação de titulos duplicados na listagem
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    // criando objetos para serem criados no banco de dados
    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
