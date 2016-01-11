package com.automatatutor.snippet

import java.util.Calendar
import java.util.Date

import scala.xml.NodeSeq
import scala.xml.NodeSeq.seqToNodeSeq
import scala.xml.Text
import scala.xml.XML

import com.automatatutor.lib.GraderConnection
import com.automatatutor.model.NFAConstructionProblem
import com.automatatutor.model.NFAConstructionProblemCategory
import com.automatatutor.model.NFAConstructionSolutionAttempt
import com.automatatutor.model.Problem
import com.automatatutor.model.SolutionAttempt

import net.liftweb.common.Box
import net.liftweb.common.Empty
import net.liftweb.common.Full
import net.liftweb.http.S
import net.liftweb.http.SHtml
import net.liftweb.http.SHtml.ElemAttr.pairToBasic
import net.liftweb.http.Templates
import net.liftweb.http.js.JE.JsRaw
import net.liftweb.http.js.JsCmd
import net.liftweb.http.js.JsCmds
import net.liftweb.http.js.JsCmds._
import net.liftweb.http.js.JsCmds.JsHideId
import net.liftweb.http.js.JsCmds.JsShowId
import net.liftweb.http.js.JsCmds.SetHtml
import net.liftweb.http.js.JsCmds.cmdToString
import net.liftweb.http.js.JsCmds.jsExpToJsCmd
import net.liftweb.mapper.By
import net.liftweb.util.AnyVar.whatVarIs
import net.liftweb.util.Helpers
import net.liftweb.util.Helpers._
import net.liftweb.util.Helpers.strToSuperArrowAssoc

object NFAProblemSnippet extends ProblemSnippet {
  def preprocessAutomatonXml ( input : String ) : String = {
    val withoutNewlines = input.filter(!List('\n', '\r').contains(_)).replace("\u0027", "\'")
    val asXml = XML.loadString(withoutNewlines)
    val symbolsWithoutEpsilon = (asXml \ "alphabet" \ "symbol").filter(node => node.text != "ε")
	val containsEpsilonBool = !(asXml \ "alphabet" \ "symbol").filter(node => node.text == "ε").isEmpty
    val alphabetWithoutEpsilon = <alphabet> { symbolsWithoutEpsilon } </alphabet>
	val containsEpsilon = <epsilon> { containsEpsilonBool } </epsilon>
    val automatonWithoutAlphabet = asXml.child.filter(_.label != "alphabet")
    val newAutomaton = <automaton> { alphabetWithoutEpsilon } { containsEpsilon } { automatonWithoutAlphabet } </automaton>
    return newAutomaton.toString
  }

  override def renderCreate( createUnspecificProb : (String, String) => Problem,
      returnFunc : () => Nothing ) : NodeSeq = {

    var shortDescription : String = ""
    var longDescription : String = ""
    var automaton : String = ""
    var category : NFAConstructionProblemCategory = null

    def create() = {
      val unspecificProblem = createUnspecificProb(shortDescription, longDescription)
      
      val specificProblem : NFAConstructionProblem = NFAConstructionProblem.create
      specificProblem.problemId(unspecificProblem).category(category).automaton(automaton)
      specificProblem.save
      
      returnFunc()
    }
    
    val allCategories = NFAConstructionProblemCategory.findAll()

    val categoryPickerEntries = allCategories.map(category => (category.id.toString, category.categoryName.is))
    def setCategoryToChosen (pickedId : String) = category = NFAConstructionProblemCategory.findByKey(pickedId.toLong) openOrThrowException("Lift has already verified that this category exists")
    
    // Remember to remove all newlines from the generated XML by using filter. 
	// Also remove 'ε' from the alphabet, as its implied (NOT TRUE CHECK IF THERE)
    val automatonField = SHtml.hidden(automatonXml => automaton = preprocessAutomatonXml(automatonXml), "", "id" -> "automatonField")
    val categoryPicker = SHtml.select(categoryPickerEntries, Empty, setCategoryToChosen)
    val shortDescriptionField = SHtml.text("", shortDescription = _)
    val longDescriptionField = SHtml.textarea("", longDescription = _, "cols" -> "80", "rows" -> "5")    
    val submitButton = SHtml.submit("Create", create, "onClick" -> "document.getElementById('automatonField').value = Editor.canvas.exportAutomaton()")
    
    val template : NodeSeq = Templates(List("description-to-nfa-problem", "create")) openOr Text("Could not find template /description-to-nfa-problem/create")
    Helpers.bind("createform", template,
        "automaton" -> automatonField,
        "category" -> categoryPicker,
        "shortdescription" -> shortDescriptionField,
        "longdescription" -> longDescriptionField,
        "submit" -> submitButton)
  }

  override def renderEdit( problem : Problem ) : NodeSeq = {
    return NodeSeq.Empty
  }
  
  override def renderSolve ( generalProblem : Problem, maxGrade : Long, lastAttempt : Box[SolutionAttempt],
      recordSolutionAttempt: (Int, Date)  => SolutionAttempt,
      returnFunc : () => Unit, remainingAttempts : () => Int, bestGrade : () => Int ) : NodeSeq = {
    val nfaConstructionProblem = NFAConstructionProblem.findByGeneralProblem(generalProblem)   
    
    def grade( attemptNfaDescription : String ) : JsCmd = {
      if(remainingAttempts() <= 0) {
        return JsShowId("feedbackdisplay") & 
			SetHtml("feedbackdisplay", Text("You do not have any attempts left for this problem"))
      }

      val attemptNfaXml = XML.loadString(attemptNfaDescription)
      val correctNfaDescription = nfaConstructionProblem.getXmlDescription.toString
      val attemptTime = Calendar.getInstance.getTime()
      val graderResponse = GraderConnection.getNfaFeedback(correctNfaDescription, attemptNfaDescription, maxGrade.toInt)
      
      val numericalGrade = graderResponse._1
      val generalAttempt = recordSolutionAttempt(numericalGrade, attemptTime)
      
      // Only save the specific attempt if we saved the general attempt
      if(generalAttempt != null) {			
    	  NFAConstructionSolutionAttempt.create.
			solutionAttemptId(generalAttempt).attemptAutomaton(attemptNfaDescription).save
      }      	 
	  
      val setNumericalGrade : JsCmd = SetHtml("grade", Text(graderResponse._1.toString + "/" + maxGrade.toString))
      val setFeedback : JsCmd = SetHtml("feedback", graderResponse._2)
      val showFeedback : JsCmd = JsShowId("feedbackdisplay")
      
      return setNumericalGrade & setFeedback & showFeedback & JsCmds.JsShowId("submitbutton")
    }
    
    val problemAlphabet = nfaConstructionProblem.getAlphabet	
	val problemEpsilonFlag = nfaConstructionProblem.getEpsilon	
	val returnLink : NodeSeq = SHtml.link("/courses/show", returnFunc, Text("Return to Course"))
    
    val alphabetJavaScriptArray = "[\"" + problemAlphabet.mkString("\",\"") + "\"]"
    val alphabetScript : NodeSeq =
      <script type="text/javascript"> 
	  Editor.canvas.setEpsilon( {problemEpsilonFlag} );
	  Editor.canvas.setAlphabet( { alphabetJavaScriptArray } ); </script>
	
    val problemAlphabetNodeSeq = Text("{" + problemAlphabet.mkString(",") + "}")    
    val problemDescriptionNodeSeq = Text(generalProblem.longDescription.is)    
		
    
    val hideSubmitButton : JsCmd = JsHideId("submitbutton")
    val ajaxCall : JsCmd = SHtml.ajaxCall(JsRaw("Editor.canvas.exportAutomaton()"), grade(_))
    val submitButton : NodeSeq = <button type='button' id='submitbutton' onclick={hideSubmitButton & ajaxCall}>Submit</button>
    
    val template : NodeSeq = Templates(List("description-to-nfa-problem", "solve")) openOr Text("Template /description-to-nfa-problem/solve not found")
    return SHtml.ajaxForm(Helpers.bind("nfaeditform", template,
        "alphabetscript" -> alphabetScript,
        "alphabettext" -> problemAlphabetNodeSeq,
        "problemdescription" -> problemDescriptionNodeSeq,
        "returnlink" -> returnLink,
        "submitbutton" -> submitButton))	
  }
  
  override def onDelete( problem : Problem ) : Unit = {
    NFAConstructionProblem.bulkDelete_!!(By(NFAConstructionProblem.problemId, problem))
  }
}

// We have this as an extra class in order to get around Lift's problems with proper 
// capitalization when looking for snippets
class Nfacreationsnippet {
  def preprocessAutomatonXml ( input : String ) : String = input.filter(!List('\n', '\r').contains(_)).replace("\u0027", "\'")
  
  def editform( xhtml : NodeSeq ) : NodeSeq = {
    val unspecificProblem : Problem = chosenProblem
    val nfaConstructionProblem : NFAConstructionProblem = NFAConstructionProblem.findByGeneralProblem(chosenProblem)

    var shortDescription : String = chosenProblem.shortDescription.is
    var longDescription : String = chosenProblem.longDescription.is
    var automaton : String = "" // Will get replaced by an XML-description of the canvas anyways
    var category : NFAConstructionProblemCategory = nfaConstructionProblem.category.obj openOrThrowException "Category must have been set"

    def edit() = {
      unspecificProblem.shortDescription(shortDescription).longDescription(longDescription).save
      nfaConstructionProblem.automaton(automaton).save
      
      S.redirectTo("/problems/index")
    }
    
    val allCategories = NFAConstructionProblemCategory.findAll()
    
    val categoryPickerEntries = allCategories.map(category => (category.id.toString, category.categoryName.is))
    def setCategoryToChosen (pickedId : String) = category = NFAConstructionProblemCategory.findByKey(pickedId.toLong) openOrThrowException("Lift has already verified that this category exists")
    
    val automatonField = SHtml.hidden(automatonXml => automaton = preprocessAutomatonXml(automatonXml), "", "id" -> "automatonField")
    val categoryPicker = SHtml.select(categoryPickerEntries, Full(category.id.toString), setCategoryToChosen)
    val shortDescriptionField = SHtml.text(shortDescription, shortDescription = _)
    val longDescriptionField = SHtml.textarea(longDescription, longDescription = _, "cols" -> "80", "rows" -> "5")
    val submitButton = SHtml.submit("Submit", edit, "onClick" -> "document.getElementById('automatonField').value = Editor.canvas.exportAutomaton()")
    
    Helpers.bind("createform", xhtml,
        "automaton" -> automatonField,
        "category" -> categoryPicker,
        "shortdescription" -> shortDescriptionField,
        "longdescription" -> longDescriptionField,
        "submit" -> submitButton)
  }
}