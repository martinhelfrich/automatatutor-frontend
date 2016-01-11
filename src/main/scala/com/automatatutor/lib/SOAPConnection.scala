package com.automatatutor.lib

import java.net.HttpURLConnection
import java.net.URL
import scala.xml.Elem
import scala.xml.NodeSeq
import scala.xml.Text
import scala.xml.Null
import scala.xml.TopScope
import scala.xml.Node
import scala.xml.UnprefixedAttribute
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.IOException
import scala.xml.XML
import net.liftweb.util.Props
import com.automatatutor.model.User

class SOAPConnection(val url : URL) {
    def wrapSOAPEnvelope(body : NodeSeq) : NodeSeq = {
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    	<soap:Body> { body } </soap:Body>
      </soap:Envelope>
    }
    
	def callMethod(namespace : String, methodName : String,  arguments : Map[String,Node]) : NodeSeq = {
	  val connection : HttpURLConnection = url.openConnection().asInstanceOf[HttpURLConnection]
	  
	  connection.setDoOutput(true)
	  connection.addRequestProperty("Content-Type", "text/xml; charset=utf-8")
	  connection.addRequestProperty("SOAPAction", '"' + namespace + "/" + methodName + '"')
	  
	  // Note the entry._2 : _*, which basically takes a Seq[A] apart so we pass the entries to Elem as varargs
	  val argumentsXml = arguments.map(entry => Elem(null, entry._1, Null, TopScope, true, entry._2 : _*)).toSeq
	  val soapBody = Elem(null, methodName, new UnprefixedAttribute("xmlns", namespace + '/', Null), TopScope, true, argumentsXml : _*)
	  
	  val requestXml = wrapSOAPEnvelope(soapBody)
	  val requestRaw = requestXml.toString
	  
	  val outputStream = connection.getOutputStream()
	  outputStream.write(requestRaw.getBytes())
	  
	  try {
          if(connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
            return NodeSeq.Empty
          } else {
            val returnRaw = scala.io.Source.fromInputStream(connection.getInputStream()).mkString
            // Strip four levels of wrapping from the result (soap:Envelope, soap:Body, Response, Result)
            val returnXml = XML.loadString(returnRaw) \ "_" \ "_" \ "_" \ "_"
            return returnXml
          }
	  } catch {
	    case exception : Exception => Text(scala.io.Source.fromInputStream(connection.getErrorStream()).mkString)
	  }
	}
}

object GraderConnection {
	val serverUrlString = Props.get("grader.url") openOrThrowException "URL of grader not specified"
	val serverUrl = new URL(serverUrlString)
	val soapConnection = new SOAPConnection(serverUrl)
	
	val namespace = Props.get("grader.methodnamespace") openOrThrowException "Namespace of grader methods not specified"	
	
	// DFA
	
	def getDfaFeedback(correctDfaDescription : String, attemptDfaDescription : String, maxGrade : Int) : (Int, NodeSeq) = {
	  val arguments = Map[String, Node](
	      "dfaCorrectDesc" -> XML.loadString(correctDfaDescription),
	      "dfaAttemptDesc" -> XML.loadString(attemptDfaDescription),
	      "maxGrade" -> Elem(null, "maxGrade", Null, TopScope, true, Text(maxGrade.toString)),
	      "feedbackLevel" -> Elem(null, "feedbackLevel", Null, TopScope, true, Text("Hint")),
	      "enabledFeedbacks" -> Elem(null, "enabledFeedbacks", Null, TopScope, true, Text("ignored")));
	  
	  val responseXml = soapConnection.callMethod(namespace, "ComputeFeedbackXML", arguments)
	  
	  return ((responseXml \ "grade").text.toInt, (responseXml \ "feedString" \ "ul" \ "li"))
	}
	
	// NFA 
	
	def getNfaFeedback(correctNfaDescription : String, attemptNfaDescription : String, maxGrade : Int) : (Int, NodeSeq) = {
	  val arguments = Map[String, Node](		   
	      "nfaCorrectDesc" -> XML.loadString(correctNfaDescription),
	      "nfaAttemptDesc" -> XML.loadString(attemptNfaDescription),
	      "maxGrade" -> Elem(null, "maxGrade", Null, TopScope, true, Text(maxGrade.toString)),		  
	      "feedbackLevel" -> Elem(null, "feedbackLevel", Null, TopScope, true, Text("Hint")),
	      "enabledFeedbacks" -> Elem(null, "enabledFeedbacks", Null, TopScope, true, Text("ignored")),
		  "userId" -> Elem(null, "userId", Null, TopScope, true, Text(User.currentUserIdInt.toString))
		  );
	  	  
	  val responseXml = soapConnection.callMethod(namespace, "ComputeFeedbackNFAXML", arguments)
	  
	  return ((responseXml \ "grade").text.toInt, (responseXml \ "feedString" \ "ul" \ "li"))
	}
	
	// NFA to DFA
	
	def getNfaToDfaFeedback(correctNfaDescription : String, attemptDfaDescription : String, maxGrade : Int) : (Int, NodeSeq) = {
	  val arguments = Map[String, Node](
	      "nfaCorrectDesc" -> XML.loadString(correctNfaDescription),
	      "dfaAttemptDesc" -> XML.loadString(attemptDfaDescription),
	      "maxGrade" -> Elem(null, "maxGrade", Null, TopScope, true, Text(maxGrade.toString)));
	  
	  val responseXml = soapConnection.callMethod(namespace, "ComputeFeedbackNfaToDfa", arguments)
	  
	  return ((responseXml \ "grade").text.toInt, (responseXml \ "feedString" \ "ul" \ "li"))
	}	
	
	// Regular expressions
	
	def getRegexFeedback(correctRegex : String, attemptRegex : String, alphabet : Seq[String], maxGrade : Int) : (Int, NodeSeq) = {
	  val arguments = Map[String, Node](
	      "regexCorrectDesc" -> <div> { correctRegex } </div>,
	      "regexAttemptDesc" -> <div> { attemptRegex } </div>,
	      "alphabet" -> <div> { alphabet.map((symbol : String) => Elem(null, "symbol", Null, TopScope, true, Text(symbol))) } </div>,
	      "feedbackLevel" -> Elem(null, "feedbackLevel", Null, TopScope, true, Text("Hint")),
	      "enabledFeedbacks" -> Elem(null, "enabledFeedbacks", Null, TopScope, true, Text("ignored")),
	      "maxGrade" -> Elem(null, "maxGrade", Null, TopScope, true, Text(maxGrade.toString)));
	  
	  val responseXml = soapConnection.callMethod(namespace, "ComputeFeedbackRegexp", arguments)
	  
	  return ((responseXml \ "grade").head.text.toInt, (responseXml \ "feedback"))
	}
	
	def getRegexParsingErrors(potentialRegex : String, alphabet : Seq[String]) : Seq[String] = {
	  val arguments = Map[String, Node](
	      "regexDesc" -> <div> { potentialRegex } </div>,
	      "alphabet" -> <div> { alphabet.map((symbol : String) => Elem(null, "symbol", Null, TopScope, true, Text(symbol))) } </div>)
	      
	  val responseXml = soapConnection.callMethod(namespace, "CheckRegexp", arguments)
	  
	  if(responseXml.text.equals("CorrectRegex")) return List() else return List(responseXml.text)
	}
	
	// Pumping lemma
	
  def getPLParsingErrors(languageDesc : String, constraintDesc : String, 
                      alphabet : Seq[String], pumpingString : String) : Seq[String] = {
    val arguments = Map[String, Node](
        "languageDesc"   -> <div> { languageDesc } </div>,
        "constraintDesc" -> <div> { constraintDesc } </div>,
        "alphabet"       -> <div> { alphabet.map((symbol : String) => Elem(null, "symbol", Null, TopScope, true, Text(symbol))) } </div>,
        "pumpingString"  -> <div> { pumpingString } </div>    
    )	
        
    val responseXml = soapConnection.callMethod(namespace, "CheckArithLanguageDescription", arguments)
    
    if (responseXml.text.equals("CorrectLanguageDescription")) return List() else return List(responseXml.text)
  }
  
  def getPLSplits(languageDesc : String, constraintDesc : String, 
                      alphabet : Seq[String], pumpingString : String) : NodeSeq = {
    val arguments = Map[String, Node](
        "languageDesc"   -> <div> { languageDesc } </div>,
        "constraintDesc" -> <div> { constraintDesc } </div>,
        "alphabet"       -> <div> { alphabet.map((symbol : String) => Elem(null, "symbol", Null, TopScope, true, Text(symbol))) } </div>,
        "pumpingString"  -> <div> { pumpingString } </div>    
    ) 
        
    return soapConnection.callMethod(namespace, "GenerateStringSplits", arguments)
    
    //if (responseXml.text.equals("CorrectLanguageDescription")) return List() else return List(responseXml.text)
  }
  
  def getPLFeedback(languageDesc : String, constraintDesc : String, 
                      alphabet : Seq[String], pumpingString : String,
                      pumpingNumbers : Node) : NodeSeq = {
    val arguments = Map[String, Node](
        "languageDesc"   -> <div> { languageDesc } </div>,
        "constraintDesc" -> <div> { constraintDesc } </div>,
        "alphabet"       -> <div> { alphabet.map((symbol : String) => Elem(null, "symbol", Null, TopScope, true, Text(symbol))) } </div>,
        "pumpingString"  -> <div> { pumpingString } </div>,
        "pumpingNumbers" -> {pumpingNumbers}   
    ) 
        
    return soapConnection.callMethod(namespace, "GetPumpingLemmaFeedback", arguments)
    
    //if (responseXml.text.equals("CorrectLanguageDescription")) return List() else return List(responseXml.text)
  }
}