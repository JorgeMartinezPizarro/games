'use client'

import MainMenu from '@/app/components/MainMenu';
import { errorMessage } from '@/app/helpers';
import React, { useState } from 'react';

const TrainerComponent = () => {
	const [question, setQuestion] = useState<string>("");
	const [answer, setAnswer] = useState<string>("");
	const [loading, setLoading] = useState<boolean>(false);
	const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);

	const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setQuestion(event.target.value);
	};

	const handleSubmit = () => {
		if (!question.trim()) {
			setAnswer("Ask me a question.!!!");
			return;
		}
		setLoading(true);
		fetch(`/bookmarks/api/ask?question=${encodeURIComponent(question)}`)
			.then((res) => res.json())
			.then((res) => {
				setAnswer(res.response.result);
				setHistory((prevHistory) => [...prevHistory, { question, answer: res.response }]);
				setLoading(false);
			})
			.catch((error) => {
				const errorMsg = errorMessage(error);
				setAnswer(errorMsg);
				setHistory((prevHistory) => [...prevHistory, { question, answer: errorMsg }]);
				setLoading(false);
			});
	};

	const handleReset = () => {
		setQuestion("");
		setAnswer("");
		setHistory([]);
	};

	const exportHistory = () => {
		const content = history.reverse()
			.map((entry, index) => `Interacción ${index + 1}:\nPregunta: ${entry.question}\nRespuesta: ${entry.answer}\n`)
			.join("\n");
		const blob = new Blob([content], { type: "text/plain" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = "historial-sesion.txt";
		link.click();
	};

	return (
		<div style={{ width: "600px", margin: "auto", padding: "20px", fontFamily: "Arial, sans-serif" }}>
			<MainMenu />
			<h1>Entrenador GPT</h1>
			<textarea
				style={{
					width: "100%",
					height: "200px",
					padding: "10px",
					fontSize: "16px",
					border: "1px solid #ccc",
					borderRadius: "5px",
					color: "black"
				}}
				value={question}
				onChange={handleChange}
				placeholder="Hola, ¿en qué puedo ayudarte?"
			/>
			<div style={{ marginTop: "20px" }}>
				<button
					onClick={handleSubmit}
					style={{
						backgroundColor: "#007BFF",
						color: "#fff",
						padding: "10px 20px",
						border: "none",
						borderRadius: "5px",
						cursor: "pointer",
					}}
				>
					Enviar Pregunta
				</button>
				<button
					onClick={handleReset}
					style={{
						backgroundColor: "#DC3545",
						color: "#fff",
						padding: "10px 20px",
						marginLeft: "10px",
						border: "none",
						borderRadius: "5px",
						cursor: "pointer",
					}}
				>
					Resetear
				</button>
				<button
					onClick={exportHistory}
					style={{
						backgroundColor: "#28A745",
						color: "#fff",
						padding: "10px 20px",
						marginLeft: "10px",
						border: "none",
						borderRadius: "5px",
						cursor: "pointer",
					}}
				>
					Exportar Historial
				</button>
			</div>
			<div style={{ marginTop: "20px" }}>
				{loading ? <p>Obteniendo respuesta...</p> : <p>{answer}</p>}
			</div>
			<div style={{ marginTop: "20px", borderTop: "1px solid #ccc", paddingTop: "10px" }}>
				<h3>Historial</h3>
				<ul>
					{history.map((entry, index) => (
						<li key={index} style={{ marginBottom: "10px" }}>
							<strong>Pregunta:</strong> {entry.question}
							<br />
							<strong>Respuesta:</strong> {entry.answer}
						</li>
					))}
				</ul>
			</div>
		</div>
	);
};

export default TrainerComponent;
